import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { AppError } from './errors';
import { hasLevel, PermLevel } from './rbac';
import { ctx } from './request-context';
import { PrismaService } from '../prisma.service';

export const Public = () => SetMetadata('public', true);
export const Perm = (module: string, level: PermLevel) =>
  SetMetadata('perm', { module, level });

export interface SessionUser {
  id: string;
  sessionId: string;
  fullName: string;
  locale: string;
  perms: Array<{ module: string; level: PermLevel }>;
  roleNames: string[];
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const targets = [ec.getHandler(), ec.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) return true;

    const req = ec.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const raw = (req.cookies?.['pandora_sid'] as string | undefined) ?? '';
    const [sessionId, token] = raw.split('.');
    if (!sessionId || !token) throw new AppError(401, 'AUTH_REQUIRED', 'errors.auth_required');

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: { roles: { include: { role: { include: { permissions: true } } } } },
        },
      },
    });
    if (
      !session ||
      session.tokenHash !== sha256(token) ||
      session.expiresAt < new Date() ||
      !session.user.isActive ||
      session.user.deletedAt
    ) {
      throw new AppError(401, 'SESSION_EXPIRED', 'errors.session_expired');
    }

    const perms = session.user.roles.flatMap((ur) =>
      ur.role.permissions.map((p) => ({ module: p.module, level: p.level as PermLevel })),
    );
    req.user = {
      id: session.user.id,
      sessionId,
      fullName: session.user.fullName,
      locale: session.user.locale,
      perms,
      roleNames: session.user.roles.map((ur) => ur.role.name),
    };
    const store = ctx();
    if (store) store.userId = session.user.id;

    const required = this.reflector.getAllAndOverride<{ module: string; level: PermLevel }>(
      'perm',
      targets,
    );
    if (required && !hasLevel(perms, required.module, required.level)) throw AppError.denied();
    return true;
  }
}
