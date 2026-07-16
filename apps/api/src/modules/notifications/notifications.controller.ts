import { Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Perm, Public, SessionUser } from '../../common/auth.guard';
import { AppError } from '../../common/errors';
import { hasLevel } from '../../common/rbac';
import { NotificationsService } from './notifications.service';
import { EXPORTS, ReportsService } from './reports.service';

type AuthedReq = Request & { user: SessionUser };
const MONTH_RE = /^\d{4}-\d{2}$/;

@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly reports: ReportsService,
  ) {}

  // ── notifications ──────────────────────────────────────────────────
  @Get('notifications')
  @Perm('dashboard', 'view')
  async list(@Query('unread') unread?: string) {
    const [data, unreadCount] = await Promise.all([
      this.notifications.list(unread === 'true'),
      this.notifications.unreadCount(),
    ]);
    return { data, meta: { unreadCount } };
  }

  @Post('notifications/:id/read')
  @Perm('dashboard', 'view')
  async read(@Param('id') id: string) {
    return { data: await this.notifications.markRead(id) };
  }

  @Post('notifications/read-all')
  @Perm('dashboard', 'view')
  async readAll() {
    return { data: await this.notifications.markAllRead() };
  }

  @Post('notifications/digest')
  @Perm('settings', 'approve')
  async digest() {
    return { data: await this.notifications.generateDailyDigest() };
  }

  /** launchd morning job — ops token, no session (same pattern as backup). */
  @Public()
  @Post('notifications/digest/scheduled')
  async scheduledDigest(@Headers('x-ops-token') token?: string) {
    if (!process.env.OPS_TOKEN || token !== process.env.OPS_TOKEN) {
      throw new AppError(401, 'AUTH_REQUIRED', 'errors.auth_required');
    }
    return { data: await this.notifications.generateDailyDigest() };
  }

  // ── reports & exports ──────────────────────────────────────────────
  @Get('reports/monthly')
  @Perm('finance', 'view')
  async monthly(@Query('month') month?: string) {
    const m = month ?? new Date().toISOString().slice(0, 7);
    if (!MONTH_RE.test(m)) throw new AppError(400, 'VALIDATION_FAILED', 'errors.month_invalid');
    return { data: await this.reports.monthly(m) };
  }

  /** CSV export per entity, guarded by that entity's own module permission. */
  @Get('exports/:entity.csv')
  async exportCsv(
    @Param('entity') entity: string,
    @Query('month') month: string | undefined,
    @Req() req: AuthedReq,
    @Res() res: Response,
  ) {
    const spec = EXPORTS[entity];
    if (!spec) throw AppError.notFound('export');
    if (!hasLevel(req.user.perms, spec.module, 'view')) throw AppError.denied();
    if (month && !MONTH_RE.test(month)) throw new AppError(400, 'VALIDATION_FAILED', 'errors.month_invalid');
    const csv = await this.reports.exportCsv(entity, month, req.user.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pandora-${entity}${month ? `-${month}` : ''}.csv"`);
    res.send('﻿' + csv); // BOM so Excel opens Bengali text correctly
  }
}
