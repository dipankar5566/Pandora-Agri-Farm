import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { statfsSync } from 'node:fs';
import { UpdateFarmInput, SettingValue } from '@pandora/contracts';
import { Perm, Public } from '../../common/auth.guard';
import { AppError } from '../../common/errors';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';
import { z } from 'zod';

type SettingInput = z.infer<typeof SettingValue>;

@Controller()
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('farm')
  @Perm('settings', 'view')
  async getFarm() {
    return { data: await this.prisma.farm.findFirstOrThrow() };
  }

  @Patch('farm')
  @Perm('settings', 'approve')
  async patchFarm(@Body(new ZodPipe(UpdateFarmInput)) body: UpdateFarmInput) {
    const before = await this.prisma.farm.findFirstOrThrow();
    const farm = await this.prisma.farm.update({ where: { id: before.id }, data: body });
    await this.audit.log('update', 'Farm', farm.id, before, body);
    await this.audit.version('Farm', farm.id, farm);
    return { data: farm };
  }

  @Get('settings/:key')
  @Perm('settings', 'view')
  async getSetting(@Param('key') key: string) {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) throw AppError.notFound('setting');
    return { data: row };
  }

  @Patch('settings/:key')
  @Perm('settings', 'approve')
  async putSetting(@Param('key') key: string, @Body(new ZodPipe(SettingValue)) body: SettingInput) {
    const before = await this.prisma.setting.findUnique({ where: { key } });
    const row = await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: body.value as object },
      update: { value: body.value as object },
    });
    await this.audit.log(before ? 'update' : 'create', 'Setting', key, before?.value ?? null, body.value);
    return { data: row };
  }

  @Get('audit-log')
  @Perm('settings', 'approve')
  async auditLog(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '50',
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(actorId ? { actorId } : {}),
        ...(cursor ? { id: { lt: BigInt(cursor) } } : {}),
      },
      orderBy: { id: 'desc' },
      take,
    });
    return {
      data: rows.map((r) => ({ ...r, id: r.id.toString() })),
      meta: { nextCursor: rows.length === take ? rows[rows.length - 1].id.toString() : null },
    };
  }

  /** Health for launchd watchdog + dashboard backup banner. Local-only exposure. */
  @Public()
  @Get('ops/health')
  async health() {
    const dbOk = await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const fs = statfsSync('/');
    const lastBackup = await this.prisma.setting
      .findUnique({ where: { key: 'backup.lastSuccessAt' } })
      .catch(() => null);
    return {
      data: {
        ok: dbOk,
        db: dbOk,
        diskFreeGb: Math.round((fs.bavail * fs.bsize) / 1e9),
        lastBackupAt: (lastBackup?.value as { at?: string } | null)?.at ?? null,
        uptimeSec: Math.round(process.uptime()),
      },
    };
  }
}
