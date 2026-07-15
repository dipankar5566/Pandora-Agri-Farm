import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { ctx } from '../../common/request-context';
import { PrismaService } from '../../prisma.service';

type Tx = Pick<PrismaService, 'auditLog' | 'recordVersion'>;

/**
 * Explicit audit calls (lean deviation from Phase 3's middleware idea):
 * every mutating service method calls log(); e2e tests assert the rows exist.
 * Pass the transaction client when inside prisma.$transaction so the audit
 * row commits atomically with the change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    action: 'create' | 'update' | 'soft_delete' | 'restore' | 'login' | 'logout' | 'approve' | 'export' | 'backup',
    entityType: string,
    entityId: string | null,
    before: unknown,
    after: unknown,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const c = ctx();
    await tx.auditLog.create({
      data: {
        actorId: c?.userId ?? null,
        action,
        entityType,
        entityId,
        before: before === null || before === undefined ? undefined : (before as object),
        after: after === null || after === undefined ? undefined : (after as object),
        requestId: c?.requestId,
      },
    });
  }

  /** Snapshot master-record state (Phase 3 §3.6) — call after each update. */
  async version(
    entityType: string,
    entityId: string,
    snapshot: unknown,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const last = await (tx as PrismaService).recordVersion.findFirst({
      where: { entityType, entityId },
      orderBy: { versionNo: 'desc' },
      select: { versionNo: true },
    });
    await tx.recordVersion.create({
      data: {
        id: ulid(),
        entityType,
        entityId,
        versionNo: (last?.versionNo ?? 0) + 1,
        snapshot: snapshot as object,
        changedBy: ctx()?.userId,
      },
    });
  }
}
