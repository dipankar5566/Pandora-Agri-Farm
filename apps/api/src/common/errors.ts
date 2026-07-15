import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { ctx } from './request-context';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly messageCode: string,
    public readonly params?: Record<string, unknown>,
    public readonly field?: string,
  ) {
    super(code);
  }

  static notFound(entity: string): AppError {
    return new AppError(404, 'NOT_FOUND', 'errors.not_found', { entity });
  }
  static conflict(code: string, params?: Record<string, unknown>): AppError {
    return new AppError(409, code, `errors.${code.toLowerCase()}`, params);
  }
  static denied(): AppError {
    return new AppError(403, 'PERM_DENIED', 'errors.perm_denied');
  }
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = ctx()?.requestId;

    if (exception instanceof AppError) {
      res.status(exception.status).json({
        error: {
          code: exception.code,
          messageCode: exception.messageCode,
          params: exception.params,
          field: exception.field,
          requestId,
        },
      });
      return;
    }
    if (exception instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          messageCode: 'errors.validation_failed',
          fields: exception.issues.map((i) => ({
            field: i.path.join('.'),
            messageCode: i.message.startsWith('errors.') ? i.message : 'errors.invalid_value',
          })),
          requestId,
        },
      });
      return;
    }
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json({
        error: { code: 'HTTP_ERROR', messageCode: 'errors.http_error', requestId },
      });
      return;
    }
    // Unknown: log loudly, reveal nothing.
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] unhandled`, exception);
    res.status(500).json({
      error: { code: 'INTERNAL', messageCode: 'errors.internal', requestId },
    });
  }
}
