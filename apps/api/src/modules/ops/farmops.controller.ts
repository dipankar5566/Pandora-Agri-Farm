import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  CompleteTaskInput, CreateLedgerEntryInput, CreateTaskInput,
  SaveFeedDayInput, SkipTaskInput, UpdateLedgerEntryInput,
} from '@pandora/contracts';
import { z } from 'zod';
import { Perm, Public, SessionUser } from '../../common/auth.guard';
import { AppError } from '../../common/errors';
import { ZodPipe } from '../../common/zod.pipe';
import { FarmOpsService } from './farmops.service';

type AuthedReq = Request & { user: SessionUser };
type CompleteTask = z.infer<typeof CompleteTaskInput>;
type SkipTask = z.infer<typeof SkipTaskInput>;

@Controller()
export class FarmOpsController {
  constructor(private readonly ops: FarmOpsService) {}

  // ── feed ───────────────────────────────────────────────────────────
  @Get('feed-logs')
  @Perm('feed', 'view')
  async feedDay(@Query('date') date: string) {
    return { data: await this.ops.feedDay(date ?? new Date().toISOString().slice(0, 10)) };
  }

  @Post('feed-logs')
  @Perm('feed', 'edit')
  async saveFeedDay(@Body(new ZodPipe(SaveFeedDayInput)) body: SaveFeedDayInput, @Req() req: AuthedReq) {
    return { data: await this.ops.saveFeedDay(body, req.user.id) };
  }

  // ── finance ────────────────────────────────────────────────────────
  @Get('finance-categories')
  @Perm('finance', 'view')
  async categories() {
    return { data: await this.ops.categories() };
  }

  @Get('ledger-entries')
  @Perm('finance', 'view')
  async ledger(@Query('month') month?: string, @Query('kind') kind?: string, @Query('cursor') cursor?: string) {
    return this.ops.listLedger({ month, kind, cursor });
  }

  @Post('ledger-entries')
  @Perm('finance', 'edit')
  async createEntry(@Body(new ZodPipe(CreateLedgerEntryInput)) body: CreateLedgerEntryInput, @Req() req: AuthedReq) {
    return { data: await this.ops.createEntry(body, req.user.id) };
  }

  @Patch('ledger-entries/:id')
  @Perm('finance', 'edit')
  async updateEntry(@Param('id') id: string, @Body(new ZodPipe(UpdateLedgerEntryInput)) body: UpdateLedgerEntryInput, @Req() req: AuthedReq) {
    return { data: await this.ops.updateEntry(id, body, req.user.id) };
  }

  @Get('finance/summary')
  @Perm('finance', 'view')
  async summary(@Query('month') month?: string) {
    return { data: await this.ops.summary(month ?? new Date().toISOString().slice(0, 7)) };
  }

  // ── tasks ──────────────────────────────────────────────────────────
  @Get('tasks')
  @Perm('tasks', 'view')
  async tasks(@Query('date') date?: string) {
    return { data: await this.ops.listTasks(date ?? new Date().toISOString().slice(0, 10)) };
  }

  @Post('tasks')
  @Perm('tasks', 'edit')
  async createTask(@Body(new ZodPipe(CreateTaskInput)) body: CreateTaskInput, @Req() req: AuthedReq) {
    return { data: await this.ops.createTask(body, req.user.id) };
  }

  @Post('tasks/:id/complete')
  @Perm('tasks', 'edit')
  async completeTask(@Param('id') id: string, @Body(new ZodPipe(CompleteTaskInput)) body: CompleteTask, @Req() req: AuthedReq) {
    return { data: await this.ops.completeTask(id, body, req.user.id) };
  }

  @Post('tasks/:id/skip')
  @Perm('tasks', 'edit')
  async skipTask(@Param('id') id: string, @Body(new ZodPipe(SkipTaskInput)) body: SkipTask, @Req() req: AuthedReq) {
    return { data: await this.ops.skipTask(id, body, req.user.id) };
  }

  // ── dashboard ──────────────────────────────────────────────────────
  @Get('dashboard')
  @Perm('dashboard', 'view')
  async dashboard() {
    return { data: await this.ops.dashboard() };
  }

  // ── backup ─────────────────────────────────────────────────────────
  @Post('ops/backup')
  @Perm('settings', 'approve')
  async backup(@Req() req: AuthedReq) {
    return { data: await this.ops.runBackup(req.user.id) };
  }

  /** launchd nightly job entry point: local call with the ops token, no session. */
  @Public()
  @Post('ops/backup/scheduled')
  async scheduledBackup(@Headers('x-ops-token') token?: string) {
    if (!process.env.OPS_TOKEN || token !== process.env.OPS_TOKEN) {
      throw new AppError(401, 'AUTH_REQUIRED', 'errors.auth_required');
    }
    return { data: await this.ops.runBackup(null) };
  }
}
