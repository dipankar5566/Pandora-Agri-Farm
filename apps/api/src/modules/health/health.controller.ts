import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  AddVitalInput, AdministerProtocolInput, CloseCaseInput, IsolateInput,
  OpenCaseInput, RecordTreatmentInput, UpdateCaseInput, UpsertProtocolInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { HealthService } from './health.service';
import { ProtocolsService } from './protocols.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly protocols: ProtocolsService,
  ) {}

  // ── cases ──────────────────────────────────────────────────────────
  @Get('health-cases')
  @Perm('health', 'view')
  async listCases(@Query('status') status?: string) {
    return { data: await this.health.listCases(status) };
  }

  @Post('health-cases')
  @Perm('health', 'edit')
  async openCase(@Body(new ZodPipe(OpenCaseInput)) body: OpenCaseInput, @Req() req: AuthedReq) {
    return { data: await this.health.openCase(body, req.user.id) };
  }

  @Get('health-cases/:id')
  @Perm('health', 'view')
  async getCase(@Param('id') id: string) {
    return { data: await this.health.getCase(id) };
  }

  @Patch('health-cases/:id')
  @Perm('health', 'edit')
  async updateCase(@Param('id') id: string, @Body(new ZodPipe(UpdateCaseInput)) body: UpdateCaseInput, @Req() req: AuthedReq) {
    return { data: await this.health.updateCase(id, body, req.user.id) };
  }

  @Post('health-cases/:id/vitals')
  @Perm('health', 'edit')
  async addVital(@Param('id') id: string, @Body(new ZodPipe(AddVitalInput)) body: AddVitalInput, @Req() req: AuthedReq) {
    return { data: await this.health.addVital(id, body, req.user.id) };
  }

  @Post('health-cases/:id/isolate')
  @Perm('health', 'edit')
  async isolate(@Param('id') id: string, @Body(new ZodPipe(IsolateInput)) body: IsolateInput, @Req() req: AuthedReq) {
    return { data: await this.health.isolate(id, body, req.user.id) };
  }

  @Post('health-cases/:id/close')
  @Perm('health', 'edit')
  async closeCase(@Param('id') id: string, @Body(new ZodPipe(CloseCaseInput)) body: CloseCaseInput, @Req() req: AuthedReq) {
    return { data: await this.health.closeCase(id, body, req.user.id) };
  }

  // ── treatments ─────────────────────────────────────────────────────
  @Post('treatments')
  @Perm('health', 'edit')
  async treat(@Body(new ZodPipe(RecordTreatmentInput)) body: RecordTreatmentInput, @Req() req: AuthedReq) {
    return { data: await this.health.recordTreatment(body, req.user.id) };
  }

  // ── protocols & dues ───────────────────────────────────────────────
  @Get('protocols')
  @Perm('health', 'view')
  async listProtocols() {
    return { data: await this.protocols.list() };
  }

  @Post('protocols')
  @Perm('settings', 'approve')
  async createProtocol(@Body(new ZodPipe(UpsertProtocolInput)) body: UpsertProtocolInput, @Req() req: AuthedReq) {
    return { data: await this.protocols.upsert(null, body, req.user.id) };
  }

  @Patch('protocols/:id')
  @Perm('settings', 'approve')
  async updateProtocol(@Param('id') id: string, @Body(new ZodPipe(UpsertProtocolInput)) body: UpsertProtocolInput, @Req() req: AuthedReq) {
    return { data: await this.protocols.upsert(id, body, req.user.id) };
  }

  @Get('protocol-dues')
  @Perm('health', 'view')
  async dues(
    @Query('status') status?: string,
    @Query('window') window?: string,
    @Query('refresh') refresh?: string,
  ) {
    if (refresh === 'true') await this.protocols.refreshDues();
    return { data: await this.protocols.listDues({ status, windowDays: window ? Number(window) : undefined }) };
  }

  @Post('protocol-administrations')
  @Perm('health', 'edit')
  async administer(@Body(new ZodPipe(AdministerProtocolInput)) body: AdministerProtocolInput, @Req() req: AuthedReq) {
    return { data: await this.protocols.administer(body, req.user.id) };
  }
}
