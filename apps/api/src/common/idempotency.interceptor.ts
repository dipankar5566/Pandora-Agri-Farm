import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { AppError } from './errors';
import { sha256 } from './auth.guard';
import { PrismaService } from '../prisma.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Phase 5 §1.1 — mutations carry Idempotency-Key. A replay with the same key
 * and payload returns the stored first response; same key + different payload
 * is a hard conflict. Login/logout are exempt (session bootstrap).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ec: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ec.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const res = ec.switchToHttp().getResponse<Response>();
    if (!MUTATING.has(req.method) || req.path.startsWith('/api/v1/auth') || !req.user) {
      return next.handle();
    }
    const key = req.header('Idempotency-Key');
    if (!key) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'errors.idempotency_key_required');
    if (!UUID_RE.test(key)) throw new AppError(400, 'IDEMPOTENCY_KEY_INVALID', 'errors.idempotency_key_invalid');

    const reqHash = sha256(`${req.method} ${req.path} ${JSON.stringify(req.body ?? {})}`);
    return from(this.prisma.idempotencyKey.findUnique({ where: { key } })).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.reqHash !== reqHash) {
            throw new AppError(409, 'IDEMPOTENCY_MISMATCH', 'errors.idempotency_mismatch');
          }
          res.status(existing.status);
          return of(existing.response);
        }
        return next.handle().pipe(
          tap((body) => {
            void this.prisma.idempotencyKey
              .create({
                data: {
                  key,
                  userId: req.user!.id,
                  reqHash,
                  status: res.statusCode,
                  response: body === undefined ? undefined : (body as object),
                },
              })
              .catch(() => undefined); // concurrent duplicate: first write wins
          }),
        );
      }),
    );
  }
}
