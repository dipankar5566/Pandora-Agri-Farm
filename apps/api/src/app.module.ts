import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './common/auth.guard';
import { AppExceptionFilter } from './common/errors';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { PrismaService } from './prisma.service';
import { AuditService } from './modules/audit/audit.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { BreedingController } from './modules/breeding/breeding.controller';
import { BreedingService } from './modules/breeding/breeding.service';
import { FilesService } from './modules/herd/files.service';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { ProtocolsService } from './modules/health/protocols.service';
import { InventoryController } from './modules/inventory/inventory.controller';
import { InventoryService } from './modules/inventory/inventory.service';
import { HerdController } from './modules/herd/herd.controller';
import { HerdService } from './modules/herd/herd.service';
import { LookupsService } from './modules/herd/lookups.service';
import { FarmOpsController } from './modules/ops/farmops.controller';
import { EmployeesController } from './modules/employees/employees.controller';
import { EmployeesService } from './modules/employees/employees.service';
import { FodderController } from './modules/fodder/fodder.controller';
import { FodderService } from './modules/fodder/fodder.service';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { NotificationsService } from './modules/notifications/notifications.service';
import { ReportsService } from './modules/notifications/reports.service';
import { PurchasesController } from './modules/purchases/purchases.controller';
import { PurchasesService } from './modules/purchases/purchases.service';
import { SalesController } from './modules/sales/sales.controller';
import { SalesService } from './modules/sales/sales.service';
import { SearchController } from './modules/search/search.controller';
import { SearchService } from './modules/search/search.service';
import { FarmOpsService } from './modules/ops/farmops.service';
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
  controllers: [AuthController, UsersController, RolesController, SettingsController, HerdController, BreedingController, InventoryController, HealthController, FarmOpsController, SearchController, SalesController, PurchasesController, EmployeesController, FodderController, NotificationsController],
  providers: [
    PrismaService,
    AuditService,
    AuthService,
    UsersService,
    HerdService,
    FilesService,
    LookupsService,
    BreedingService,
    InventoryService,
    HealthService,
    ProtocolsService,
    FarmOpsService,
    SearchService,
    SalesService,
    PurchasesService,
    EmployeesService,
    FodderService,
    NotificationsService,
    ReportsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
