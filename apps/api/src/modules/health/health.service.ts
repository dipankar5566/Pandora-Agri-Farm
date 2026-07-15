import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import type {
  AddVitalInput, CloseCaseInput, ExitAnimalInput, IsolateInput, OpenCaseInput,
  RecordTreatmentInput, UpdateCaseInput,
} from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { HerdService } from '../herd/herd.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../prisma.service';

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly herd: HerdService,
    private readonly inventory: InventoryService,
  ) {}

  private event(
    tx: Tx, animalId: string, eventType: string, summaryCode: string,
    params: Record<string, unknown>, occurredAt: Date, ref?: { type: string; id: string },
  ) {
    return tx.animalEvent.create({
      data: {
        id: ulid(), animalId, eventType, occurredAt, summaryCode,
        summaryParams: params as object, refType: ref?.type, refId: ref?.id,
      },
    });
  }

  private async activeAnimal(id: string) {
    const a = await this.prisma.animal.findFirst({ where: { id, deletedAt: null } });
    if (!a) throw AppError.notFound('animal');
    if (a.status !== 'active') throw AppError.conflict('ANIMAL_NOT_ACTIVE');
    return a;
  }

  // ── cases ──────────────────────────────────────────────────────────
  async listCases(status?: string) {
    const cases = await this.prisma.healthCase.findMany({
      where: status === 'open' ? { status: { in: ['open', 'monitoring'] } } : status ? { status: status as never } : {},
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    const animals = await this.prisma.animal.findMany({
      where: { id: { in: cases.map((c) => c.animalId) } },
      select: { id: true, tagNumber: true, name: true },
    });
    const byId = new Map(animals.map((a) => [a.id, a]));
    return cases.map((c) => ({ ...c, animal: byId.get(c.animalId) }));
  }

  async getCase(id: string) {
    const c = await this.prisma.healthCase.findUnique({
      where: { id },
      include: {
        vitals: { orderBy: { recordedAt: 'desc' } },
        treatments: { orderBy: { treatedAt: 'desc' } },
      },
    });
    if (!c) throw AppError.notFound('case');
    const animal = await this.prisma.animal.findUnique({
      where: { id: c.animalId },
      select: { id: true, tagNumber: true, name: true, currentWeightKg: true },
    });
    const itemIds = [...new Set(c.treatments.map((t) => t.itemId))];
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } });
    const itemById = new Map(items.map((i) => [i.id, i.name]));
    return {
      ...c,
      animal,
      treatments: c.treatments.map((t) => ({ ...t, itemName: itemById.get(t.itemId) })),
    };
  }

  async openCase(input: OpenCaseInput, actor: string) {
    const animal = await this.activeAnimal(input.animalId);
    const openedAt = input.openedAt ? day(input.openedAt) : new Date();
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.healthCase.create({
        data: {
          id: ulid(), animalId: animal.id, openedAt, symptoms: input.symptoms,
          provisionalDiagnosis: input.provisionalDiagnosis, severity: input.severity,
          vetName: input.vetName, createdBy: actor,
        },
      });
      await this.event(tx, animal.id, 'case_opened', 'timeline.case_opened', { severity: input.severity }, openedAt, { type: 'case', id: c.id });
      await this.audit.log('create', 'HealthCase', c.id, null, { animal: animal.tagNumber, ...input }, tx);
      return c;
    });
  }

  async updateCase(id: string, input: UpdateCaseInput, actor: string) {
    const before = await this.prisma.healthCase.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('case');
    if (before.closedAt) throw AppError.conflict('CASE_CLOSED');
    const c = await this.prisma.healthCase.update({ where: { id }, data: { ...input, updatedBy: actor } });
    await this.audit.log('update', 'HealthCase', id, before, input);
    return c;
  }

  async addVital(caseId: string, input: AddVitalInput, actor: string) {
    const c = await this.prisma.healthCase.findUnique({ where: { id: caseId } });
    if (!c) throw AppError.notFound('case');
    if (c.closedAt) throw AppError.conflict('CASE_CLOSED');
    const vital = await this.prisma.caseVital.create({
      data: {
        id: ulid(), caseId,
        recordedAt: input.recordedAt ? day(input.recordedAt) : new Date(),
        temperatureC: input.temperatureC, pulseBpm: input.pulseBpm,
        respirationRpm: input.respirationRpm, notes: input.notes, recordedBy: actor,
      },
    });
    await this.audit.log('create', 'CaseVital', vital.id, null, input);
    return vital;
  }

  async isolate(caseId: string, input: IsolateInput, actor: string) {
    const c = await this.prisma.healthCase.findUnique({ where: { id: caseId } });
    if (!c) throw AppError.notFound('case');
    if (c.closedAt) throw AppError.conflict('CASE_CLOSED');
    const pen = await this.prisma.pen.findUnique({ where: { id: input.penId } });
    if (!pen) throw AppError.notFound('pen');
    if (!['isolation', 'hospital', 'quarantine'].includes(pen.purpose)) {
      throw AppError.conflict('NOT_AN_ISOLATION_PEN');
    }
    const animal = await this.activeAnimal(c.animalId);
    return this.prisma.$transaction(async (tx) => {
      await tx.penMovement.create({
        data: {
          id: ulid(), animalId: animal.id, fromPenId: animal.currentPenId,
          toPenId: pen.id, movedAt: new Date(), reason: 'isolation', createdBy: actor,
        },
      });
      await tx.animal.update({ where: { id: animal.id }, data: { currentPenId: pen.id } });
      const updated = await tx.healthCase.update({
        where: { id: caseId },
        data: { isIsolated: true, isolationPenId: pen.id, updatedBy: actor },
      });
      await this.event(tx, animal.id, 'isolated', 'timeline.isolated', { pen: pen.name }, new Date(), { type: 'case', id: caseId });
      await this.audit.log('update', 'HealthCase', caseId, { isIsolated: c.isIsolated }, { isIsolated: true, pen: pen.name }, tx);
      return updated;
    });
  }

  async closeCase(caseId: string, input: CloseCaseInput, actor: string) {
    const c = await this.prisma.healthCase.findUnique({ where: { id: caseId } });
    if (!c) throw AppError.notFound('case');
    if (c.closedAt) throw AppError.conflict('CASE_CLOSED');

    // Death closes the animal too — exit first (it has the stricter rules),
    // then the case. Sequential, exit-first: a failed exit leaves the case open.
    if (input.status === 'died') {
      const exit: ExitAnimalInput = {
        exitType: 'death',
        confirmOverride: false,
        exitDate: input.exit!.exitDate,
        causeCategory: input.exit!.causeCategory,
        causeDetail: input.exit!.causeDetail,
        postMortemDone: input.exit!.postMortemDone,
      };
      await this.herd.exit(c.animalId, exit, actor);
    }
    return this.prisma.$transaction(async (tx) => {
      const closed = await tx.healthCase.update({
        where: { id: caseId },
        data: { status: input.status, closedAt: new Date(), outcomeNotes: input.outcomeNotes, updatedBy: actor },
      });
      await this.event(
        tx, c.animalId, 'case_closed', 'timeline.case_closed',
        { outcome: input.status }, new Date(), { type: 'case', id: caseId },
      );
      await this.audit.log('update', 'HealthCase', caseId, { status: c.status }, { status: input.status }, tx);
      return closed;
    });
  }

  // ── treatments (stock-consuming) ───────────────────────────────────
  async recordTreatment(input: RecordTreatmentInput, actor: string) {
    const animal = await this.activeAnimal(input.animalId);
    const item = await this.prisma.item.findFirst({ where: { id: input.itemId, deletedAt: null } });
    if (!item) throw AppError.notFound('item');
    if (input.caseId) {
      const c = await this.prisma.healthCase.findUnique({ where: { id: input.caseId } });
      if (!c || c.animalId !== animal.id) throw AppError.notFound('case');
      if (c.closedAt) throw AppError.conflict('CASE_CLOSED');
    }
    const treatedAt = input.treatedAt ? day(input.treatedAt) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const id = ulid();
      const picked = await this.inventory.consume(
        tx, item.id, input.doseAmount, { type: 'treatment', id },
        { batchId: input.batchId, onDate: treatedAt, actor },
      );
      const withdrawalUntil = item.withdrawalDays
        ? addDays(treatedAt, item.withdrawalDays)
        : null;
      const treatment = await tx.treatment.create({
        data: {
          id, animalId: animal.id, caseId: input.caseId, treatedAt,
          itemId: item.id, batchId: picked.batchId,
          doseAmount: input.doseAmount, doseUnit: input.doseUnit, route: input.route,
          weightAtTreatmentKg: input.weightAtTreatmentKg ?? animal.currentWeightKg,
          withdrawalUntil, givenBy: actor, prescribedBy: input.prescribedBy, notes: input.notes,
        },
      });
      await this.event(
        tx, animal.id, 'treated', 'timeline.treated',
        { item: item.name, dose: input.doseAmount, unit: input.doseUnit }, treatedAt,
        { type: 'treatment', id },
      );
      await this.audit.log('create', 'Treatment', id, null, { animal: animal.tagNumber, item: item.name, dose: input.doseAmount }, tx);
      return { ...treatment, batchNo: picked.batchNo, itemName: item.name };
    });
  }

}
