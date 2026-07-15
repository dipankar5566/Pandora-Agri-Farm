import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import type { AdministerProtocolInput, UpsertProtocolInput } from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../prisma.service';

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const KID_AGE_DAYS = 183;

@Injectable()
export class ProtocolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  list() {
    return this.prisma.healthProtocol.findMany({ orderBy: { name: 'asc' } });
  }

  async upsert(id: string | null, input: UpsertProtocolInput, actor: string) {
    if (!input.dosePerKg && !input.doseFixed && input.isActive) {
      // A protocol without any dose rule can still exist (e.g. dipping) — allowed.
    }
    if (id) {
      const before = await this.prisma.healthProtocol.findUnique({ where: { id } });
      if (!before) throw AppError.notFound('protocol');
      const p = await this.prisma.healthProtocol.update({ where: { id }, data: input });
      await this.audit.log('update', 'HealthProtocol', id, before, input);
      await this.audit.version('HealthProtocol', id, p);
      return p;
    }
    const p = await this.prisma.healthProtocol.create({ data: { id: ulid(), ...input } });
    await this.audit.log('create', 'HealthProtocol', p.id, null, input);
    return p;
  }

  /**
   * Deterministic, idempotent due generation (Phase 3 §6.6). Runs on demand
   * (dues page load / after administrations); becomes a pg-boss nightly job in
   * the ops module. For every active protocol × eligible active animal it
   * ensures exactly one pending due — the next occurrence.
   */
  async refreshDues(): Promise<{ created: number; removed: number }> {
    const [protocols, animals] = await Promise.all([
      this.prisma.healthProtocol.findMany({ where: { isActive: true } }),
      this.prisma.animal.findMany({
        where: { status: 'active', deletedAt: null },
        select: { id: true, sex: true, birthDate: true },
      }),
    ]);
    const pregnantDoes = new Set(
      (await this.prisma.pregnancy.findMany({ where: { status: 'ongoing' }, select: { doeId: true } })).map((p) => p.doeId),
    );
    const lastAdmins = await this.prisma.protocolAdministration.groupBy({
      by: ['protocolId', 'animalId'],
      _max: { givenOn: true },
    });
    const lastByKey = new Map(lastAdmins.map((a) => [`${a.protocolId}:${a.animalId}`, a._max.givenOn!]));

    let created = 0;
    let removed = 0;
    const today = new Date();

    for (const protocol of protocols) {
      for (const animal of animals) {
        const ageDays = Math.floor((today.getTime() - animal.birthDate.getTime()) / 86400000);
        const eligible =
          protocol.appliesTo === 'all' ||
          (protocol.appliesTo === 'female' && animal.sex === 'female') ||
          (protocol.appliesTo === 'male' && animal.sex === 'male') ||
          (protocol.appliesTo === 'kid' && ageDays < KID_AGE_DAYS) ||
          (protocol.appliesTo === 'adult' && ageDays >= KID_AGE_DAYS) ||
          (protocol.appliesTo === 'pregnant' && pregnantDoes.has(animal.id));

        const last = lastByKey.get(`${protocol.id}:${animal.id}`);
        let nextDue: Date | null = null;
        if (eligible) {
          if (last && protocol.repeatIntervalDays) {
            nextDue = addDays(last, protocol.repeatIntervalDays);
          } else if (!last && protocol.firstDoseAgeDays !== null && ageDays >= 0) {
            nextDue = addDays(animal.birthDate, protocol.firstDoseAgeDays!);
          }
        }

        const pending = await this.prisma.protocolDue.findFirst({
          where: { protocolId: protocol.id, animalId: animal.id, status: 'pending' },
        });
        if (nextDue) {
          if (pending && pending.dueDate.getTime() !== nextDue.getTime()) {
            await this.prisma.protocolDue.delete({ where: { id: pending.id } });
            removed++;
          }
          if (!pending || pending.dueDate.getTime() !== nextDue.getTime()) {
            await this.prisma.protocolDue.upsert({
              where: { protocolId_animalId_dueDate: { protocolId: protocol.id, animalId: animal.id, dueDate: nextDue } },
              create: { id: ulid(), protocolId: protocol.id, animalId: animal.id, dueDate: nextDue },
              update: {},
            });
            created++;
          }
        } else if (pending) {
          await this.prisma.protocolDue.delete({ where: { id: pending.id } });
          removed++;
        }
      }
    }
    // Dues for exited/deleted animals are cleaned up too.
    const stale = await this.prisma.protocolDue.findMany({
      where: { status: 'pending', animalId: { notIn: animals.map((a) => a.id) } },
      select: { id: true },
    });
    if (stale.length) {
      await this.prisma.protocolDue.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
      removed += stale.length;
    }
    return { created, removed };
  }

  async listDues(opts: { status?: string; windowDays?: number }) {
    const dues = await this.prisma.protocolDue.findMany({
      where: {
        status: (opts.status as never) ?? 'pending',
        ...(opts.windowDays ? { dueDate: { lte: addDays(new Date(), opts.windowDays) } } : {}),
      },
      include: { protocol: { select: { name: true, nameBn: true, type: true, dosePerKg: true, doseFixed: true, doseUnit: true, defaultItemId: true } } },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });
    const animals = await this.prisma.animal.findMany({
      where: { id: { in: [...new Set(dues.map((d) => d.animalId))] } },
      select: { id: true, tagNumber: true, name: true, currentWeightKg: true, currentPenId: true },
    });
    const byId = new Map(animals.map((a) => [a.id, a]));
    const today = new Date();
    return dues.map((d) => ({
      ...d,
      animal: byId.get(d.animalId),
      overdueDays: Math.max(0, Math.floor((today.getTime() - d.dueDate.getTime()) / 86400000)),
      suggestedDose:
        d.protocol.dosePerKg && byId.get(d.animalId)?.currentWeightKg
          ? Math.round(Number(d.protocol.dosePerKg) * Number(byId.get(d.animalId)!.currentWeightKg) * 100) / 100
          : d.protocol.doseFixed
            ? Number(d.protocol.doseFixed)
            : null,
    }));
  }

  /** Batch administration: doses, stock, dues, next dues, timeline — one transaction. */
  async administer(input: AdministerProtocolInput, actor: string) {
    const protocol = await this.prisma.healthProtocol.findUnique({ where: { id: input.protocolId } });
    if (!protocol) throw AppError.notFound('protocol');
    const itemId = input.itemId ?? protocol.defaultItemId;
    const item = itemId
      ? await this.prisma.item.findFirst({ where: { id: itemId, deletedAt: null } })
      : null;
    if (itemId && !item) throw AppError.notFound('item');

    const animals = await this.prisma.animal.findMany({
      where: { id: { in: input.entries.map((e) => e.animalId) }, status: 'active', deletedAt: null },
    });
    if (animals.length !== input.entries.length) throw AppError.notFound('animal');
    const byId = new Map(animals.map((a) => [a.id, a]));

    // Deworming rotation nudge: same anthelmintic class as each animal's last dose.
    if (protocol.type === 'deworming' && item?.anthelminticClass && !input.confirmOverride) {
      const lastSameClass = await this.prisma.protocolAdministration.findFirst({
        where: {
          protocolId: protocol.id,
          animalId: { in: animals.map((a) => a.id) },
          anthelminticClassSnapshot: item.anthelminticClass,
        },
        orderBy: { givenOn: 'desc' },
      });
      if (lastSameClass) {
        throw new AppError(422, 'RULE_OVERRIDE_REQUIRED', 'errors.rule_override_required', {
          warnings: ['DEWORMER_SAME_CLASS'],
        });
      }
    }

    const givenOn = day(input.givenOn);
    return this.prisma.$transaction(async (tx) => {
      const results: Array<{ animalId: string; dose: number | null; batchNo?: string | null }> = [];
      for (const entry of input.entries) {
        const animal = byId.get(entry.animalId)!;
        const dose =
          entry.doseOverride ??
          (protocol.dosePerKg && animal.currentWeightKg
            ? Math.round(Number(protocol.dosePerKg) * Number(animal.currentWeightKg) * 100) / 100
            : protocol.doseFixed
              ? Number(protocol.doseFixed)
              : null);
        if (item && dose === null) {
          throw new AppError(400, 'DOSE_UNRESOLVED', 'errors.dose_unresolved', { animal: animal.tagNumber });
        }
        const id = ulid();
        let picked: { batchId: string; batchNo: string | null; expiryDate: Date | null } | null = null;
        if (item && dose) {
          picked = await this.inventory.consume(
            tx, item.id, dose, { type: 'protocol_administration', id },
            { batchId: input.batchId, onDate: givenOn, actor },
          );
        }
        const nextDueDate = protocol.repeatIntervalDays ? addDays(givenOn, protocol.repeatIntervalDays) : null;
        await tx.protocolAdministration.create({
          data: {
            id, protocolId: protocol.id, animalId: animal.id, givenOn,
            itemId: item?.id, batchId: picked?.batchId,
            doseAmount: dose, doseUnit: protocol.doseUnit ?? item?.unit,
            weightAtAdminKg: animal.currentWeightKg,
            anthelminticClassSnapshot: item?.anthelminticClass,
            withdrawalUntil: item?.withdrawalDays ? addDays(givenOn, item.withdrawalDays) : null,
            givenBy: actor, vetName: input.vetName, nextDueDate, notes: input.notes,
          },
        });
        // Mark the pending due as done; schedule the next one.
        const pending = await tx.protocolDue.findFirst({
          where: { protocolId: protocol.id, animalId: animal.id, status: 'pending' },
        });
        if (pending) {
          await tx.protocolDue.update({ where: { id: pending.id }, data: { status: 'done', fulfilledById: id } });
        }
        if (nextDueDate) {
          await tx.protocolDue.upsert({
            where: { protocolId_animalId_dueDate: { protocolId: protocol.id, animalId: animal.id, dueDate: nextDueDate } },
            create: { id: ulid(), protocolId: protocol.id, animalId: animal.id, dueDate: nextDueDate },
            update: {},
          });
        }
        await tx.animalEvent.create({
          data: {
            id: ulid(), animalId: animal.id,
            eventType: protocol.type === 'deworming' ? 'dewormed' : 'vaccinated',
            occurredAt: givenOn,
            summaryCode: protocol.type === 'deworming' ? 'timeline.dewormed' : 'timeline.vaccinated',
            summaryParams: { protocol: protocol.name, dose, batch: picked?.batchNo } as object,
            refType: 'protocol_administration', refId: id,
          },
        });
        results.push({ animalId: animal.id, dose, batchNo: picked?.batchNo });
      }
      await this.audit.log('create', 'ProtocolAdministration', null, null, {
        protocol: protocol.name, on: input.givenOn, count: results.length,
      }, tx);
      return { administered: results.length, results, nextDueInDays: protocol.repeatIntervalDays };
    }, { timeout: 60000 });
  }
}
