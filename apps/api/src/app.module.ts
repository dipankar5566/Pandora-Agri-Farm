import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './common/auth.guard';
import { AppExceptionFilter } from './common/errors';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { PrismaService } from './prisma.service';
import { AuditService } from './modules/audit/audit.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { FilesService } from './modules/herd/files.service';
import { HerdController } from './modules/herd/herd.controller';
import { HerdService } from './modules/herd/herd.service';
import { LookupsService } from './modules/herd/lookups.service';
import { RolesController } from './modules/roles/roles.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { UsersController } from './modules/users/users.controller';
import { UsersService } from './modules/users/users.service';

/**
 * Module 0 is deliberately one flat Nest module (lean rule): bounded-context
 * modules (herd, breeding, …) get their own @Module when they arrive with
 * actual domain rules.
 */
@Module({
  controllers: [AuthController, UsersController, RolesController, SettingsController, HerdController],
  providers: [
    PrismaService,
    AuditService,
    AuthService,
    UsersService,
    HerdService,
    FilesService,
    LookupsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
