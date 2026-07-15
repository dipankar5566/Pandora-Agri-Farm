import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import type {
  BatchWeighInput, BulkIntakeInput, CreateAnimalInput, ExitAnimalInput,
  ListAnimalsQuery, MoveAnimalInput, UpdateAnimalInput,
} from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

type Tx = Prisma.TransactionClient;
const day = (s: string | Date) => new Date(s instanceof Date ? s : `${s}T00:00:00.000Z`);
const today = () => new Date(new Date().toISOString().slice(0, 10));

const LIST_INCLUDE = {
  breed: { select: { id: true, name: true, nameBn: true } },
  pen: { select: { id: true, name: true, shed: { select: { name: true } } } },
} satisfies Prisma.AnimalInclude;

@Injectable()
export class HerdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Timeline writer — every herd mutation records its event here (NFR-11). */
  private event(
    tx: Tx, animalId: string, eventType: string, summaryCode: string,
    params: Record<string, unknown>, occurredAt: Date, ref?: { type: string; id: string },
  ) {
    return tx.animalEvent.create({
      data: {
        id: ulid(), animalId, eventType, occurredAt,
        summaryCode, summaryParams: params as object,
        refType: ref?.type, refId: ref?.id,
      },
    });
  }

  /** PGF-0001 style tags from the settings counter, in-transaction, collision-safe. */
  private async nextTag(tx: Tx): Promise<string> {
    const farm = await tx.farm.findFirstOrThrow({ select: { tagPrefix: true } });
    const row = await tx.$queryRaw<Array<{ value: number }>>`
      UPDATE settings SET value = (value::int + 1)::text::jsonb
      WHERE key = 'tag.next' RETURNING (value::int - 1) AS value`;
    let n = row[0]?.value ?? 1;
    let tag = `${farm.tagPrefix}-${String(n).padStart(4, '0')}`;
    while (await tx.animal.findFirst({ where: { tagNumber: tag, deletedAt: null }, select: { id: true } })) {
      n += 1;
      tag = `${farm.tagPrefix}-${String(n).padStart(4, '0')}`;
      await tx.setting.update({ where: { key: 'tag.next' }, data: { value: n + 1 } });
    }
    return tag;
  }

  private async assertParents(tx: Tx, damId?: string | null, sireId?: string | null, selfId?: string) {
    for (const [id, want, code] of [
      [damId, 'female', 'DAM_NOT_FEMALE'],
      [sireId, 'male', 'SIRE_NOT_MALE'],
    ] as const) {
      if (!id) continue;
      if (id === selfId) throw AppError.conflict('PARENT_IS_SELF');
      const p = await tx.animal.findFirst({ where: { id, deletedAt: null }, select: { sex: true } });
      if (!p) throw AppError.notFound('parent animal');
      if (p.sex !== want) throw AppError.conflict(code);
    }
  }

  async list(q: ListAnimalsQuery) {
    const where: Prisma.AnimalWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.breedId ? { breedId: q.breedId } : {}),
      ...(q.penId ? { currentPenId: q.penId } : {}),
      ...(q.sex ? { sex: q.sex } : {}),
      ...(q.q
        ? { OR: [
            { tagNumber: { contains: q.q, mode: 'insensitive' } },
            { name: { contains: q.q, mode: 'insensitive' } },
          ] }
        : {}),
      ...(q.cursor ? { id: { lt: q.cursor } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.animal.findMany({ where, include: LIST_INCLUDE, orderBy: { id: 'desc' }, take: q.limit }),
      this.prisma.animal.count({ where: { ...where, id: undefined } }),
    ]);
    return {
      data: rows.map((a) => this.view(a)),
      meta: { total, nextCursor: rows.length === q.limit ? rows[rows.length - 1].id : null },
    };
  }

  private view<T extends { birthDate: Date }>(a: T): T & { ageMonths: number } {
    const months = Math.floor((Date.now() - new Date(a.birthDate).getTime()) / (30.44 * 86400000));
    return { ...a, ageMonths: months };
  }

  async get(id: string) {
    const a = await this.prisma.animal.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...LIST_INCLUDE,
        dam: { select: { id: true, tagNumber: true, name: true } },
        sire: { select: { id: true, tagNumber: true, name: true } },
        exit: true,
      },
    });
    if (!a) throw AppError.notFound('animal');
    const withdrawalUntil = await this.activeWithdrawalUntil(id);
    return { ...this.view(a), withdrawalUntil };
  }

  /** Latest future withdrawal end across treatments and protocol administrations. */
  private async activeWithdrawalUntil(animalId: string): Promise<Date | null> {
    const now = new Date();
    const [t, p] = await Promise.all([
      this.prisma.treatment.findFirst({
        where: { animalId, withdrawalUntil: { gte: now } },
        orderBy: { withdrawalUntil: 'desc' },
        select: { withdrawalUntil: true },
      }),
      this.prisma.protocolAdministration.findFirst({
        where: { animalId, withdrawalUntil: { gte: now } },
        orderBy: { withdrawalUntil: 'desc' },
        select: { withdrawalUntil: true },
      }),
    ]);
    const dates = [t?.withdrawalUntil, p?.withdrawalUntil].filter((d): d is Date => !!d);
    return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  }

  async create(input: CreateAnimalInput, actor: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertRefs(tx, input.breedId, input.currentPenId);
      await this.assertParents(tx, input.damId, input.sireId);
      let tagNumber = input.tagNumber;
      if (tagNumber) {
        const clash = await tx.animal.findFirst({ where: { tagNumber, deletedAt: null } });
        if (clash) throw AppError.conflict('TAG_TAKEN', { tag: tagNumber });
      } else {
        tagNumber = await this.nextTag(tx);
      }
      const id = ulid();
      const animal = await tx.animal.create({
        data: {
          id, tagNumber,
          rfidTag: input.rfidTag, name: input.name, breedId: input.breedId,
          crossPercent: input.crossPercent, sex: input.sex,
          birthDate: day(input.birthDate), birthDateEstimated: input.birthDateEstimated,
          damId: input.damId, sireId: input.sireId, source: input.source,
          purchasePrice: input.purchasePrice, supplierName: input.supplierName,
          purchaseDate: input.purchaseDate ? day(input.purchaseDate) : undefined,
          currentPenId: input.currentPenId, groupLabel: input.groupLabel,
          colorMarkings: input.colorMarkings, notes: input.notes,
          currentWeightKg: input.weightKg, currentBcs: input.bcs,
          statusDate: today(), createdBy: actor,
        },
        include: LIST_INCLUDE,
      });
      await this.event(tx, id, 'registered', 'timeline.registered', { tag: tagNumber, source: input.source }, new Date());
      if (input.weightKg !== undefined) {
        const w = await tx.weightRecord.create({
          data: { id: ulid(), animalId: id, weighedOn: today(), weightKg: input.weightKg, bcs: input.bcs, createdBy: actor },
        });
        await this.event(tx, id, 'weighed', 'timeline.weighed', { kg: input.weightKg }, new Date(), { type: 'weight', id: w.id });
      }
      await this.audit.log('create', 'Animal', id, null, { tagNumber, breedId: input.breedId, sex: input.sex }, tx);
      return this.view(animal);
    });
  }

  private async assertRefs(tx: Tx, breedId?: string, penId?: string | null) {
    if (breedId && !(await tx.breed.findUnique({ where: { id: breedId } }))) throw AppError.notFound('breed');
    if (penId && !(await tx.pen.findUnique({ where: { id: penId } }))) throw AppError.notFound('pen');
  }

  async update(id: string, input: UpdateAnimalInput, actor: string) {
    const before = await this.prisma.animal.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('animal');
    return this.prisma.$transaction(async (tx) => {
      await this.assertRefs(tx, input.breedId ?? undefined, undefined);
      if (input.damId !== undefined || input.sireId !== undefined) {
        await this.assertParents(tx, input.damId, input.sireId, id);
      }
      const animal = await tx.animal.update({
        where: { id },
        data: {
          ...input,
          birthDate: input.birthDate ? day(input.birthDate) : undefined,
          insurance: input.insurance === null ? Prisma.DbNull : (input.insurance as object | undefined),
          updatedBy: actor,
        },
        include: LIST_INCLUDE,
      });
      await this.audit.log('update', 'Animal', id, before, input, tx);
      await this.audit.version('Animal', id, animal, tx);
      return this.view(animal);
    });
  }

  async bulkIntake(input: BulkIntakeInput, actor: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertRefs(tx, input.defaults.breedId, input.defaults.currentPenId);
      const created: Array<{ id: string; tagNumber: string }> = [];
      for (const row of input.rows) {
        const birthDate = row.birthDate
          ? day(row.birthDate)
          : new Date(Date.now() - row.ageMonths! * 30.44 * 86400000);
        let tagNumber = row.tagNumber;
        if (tagNumber) {
          const clash = await tx.animal.findFirst({ where: { tagNumber, deletedAt: null } });
          if (clash) throw AppError.conflict('TAG_TAKEN', { tag: tagNumber });
        } else {
          tagNumber = await this.nextTag(tx);
        }
        const id = ulid();
        await tx.animal.create({
          data: {
            id, tagNumber, name: row.name, sex: row.sex,
            breedId: input.defaults.breedId, source: input.defaults.source,
            currentPenId: input.defaults.currentPenId,
            purchaseDate: input.defaults.purchaseDate ? day(input.defaults.purchaseDate) : undefined,
            purchasePrice: row.purchasePrice,
            birthDate, birthDateEstimated: !row.birthDate,
            currentWeightKg: row.weightKg, statusDate: today(), createdBy: actor,
          },
        });
        await this.event(tx, id, 'registered', 'timeline.registered', { tag: tagNumber, source: input.defaults.source, bulk: true }, new Date());
        if (row.weightKg !== undefined) {
          await tx.weightRecord.create({
            data: { id: ulid(), animalId: id, weighedOn: today(), weightKg: row.weightKg, createdBy: actor },
          });
        }
        created.push({ id, tagNumber });
      }
      await this.audit.log('create', 'Animal', null, null, { bulkIntake: created.length, tags: created.map((c) => c.tagNumber) }, tx);
      return { created };
    }, { timeout: 60000 });
  }

  async move(id: string, input: MoveAnimalInput, actor: string) {
    const animal = await this.prisma.animal.findFirst({ where: { id, deletedAt: null } });
    if (!animal) throw AppError.notFound('animal');
    if (animal.status !== 'active') throw AppError.conflict('ANIMAL_NOT_ACTIVE');
    const pen = await this.prisma.pen.findUnique({
      where: { id: input.toPenId },
      include: { _count: { select: { animals: { where: { status: 'active', deletedAt: null } } } } },
    });
    if (!pen) throw AppError.notFound('pen');
    const movedAt = input.movedAt ? day(input.movedAt) : new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const mv = await tx.penMovement.create({
        data: {
          id: ulid(), animalId: id, fromPenId: animal.currentPenId,
          toPenId: input.toPenId, movedAt, reason: input.reason, notes: input.notes, createdBy: actor,
        },
      });
      await tx.animal.update({ where: { id }, data: { currentPenId: input.toPenId, updatedBy: actor } });
      await this.event(tx, id, 'moved', 'timeline.moved', { toPen: pen.name, reason: input.reason }, movedAt, { type: 'move', id: mv.id });
      await this.audit.log('update', 'Animal', id, { pen: animal.currentPenId }, { pen: input.toPenId, reason: input.reason }, tx);
      return mv;
    });
    const overCapacity = pen.capacity != null && pen._count.animals + 1 > pen.capacity;
    return { data: result, meta: overCapacity ? { warningCode: 'warnings.pen_over_capacity' } : {} };
  }

  async exit(id: string, input: ExitAnimalInput, actor: string) {
    const animal = await this.prisma.animal.findFirst({ where: { id, deletedAt: null }, include: { exit: true } });
    if (!animal) throw AppError.notFound('animal');
    if (animal.exit || animal.status !== 'active') throw AppError.conflict('ANIMAL_ALREADY_EXITED');
    // Meat-safety guard: no sale while a medicine withdrawal period is active.
    if (input.exitType === 'sale' || input.exitType === 'cull_sale') {
      const withdrawal = await this.activeWithdrawalUntil(id);
      if (withdrawal && !input.confirmOverride) {
        throw new AppError(422, 'RULE_OVERRIDE_REQUIRED', 'errors.rule_override_required', {
          warnings: ['WITHDRAWAL_ACTIVE'],
          withdrawalUntil: withdrawal.toISOString().slice(0, 10),
        });
      }
    }
    const statusByType = { sale: 'sold', cull_sale: 'culled', death: 'died', disposal: 'disposed', lost: 'lost' } as const;
    return this.prisma.$transaction(async (tx) => {
      const exit = await tx.animalExit.create({
        data: {
          id: ulid(), animalId: id, exitType: input.exitType, exitDate: day(input.exitDate),
          buyerName: input.buyerName, liveWeightKg: input.liveWeightKg, price: input.price,
          causeCategory: input.causeCategory, causeDetail: input.causeDetail,
          postMortemDone: input.postMortemDone, disposalMethod: input.disposalMethod,
          notes: input.notes, createdBy: actor,
        },
      });
      await tx.animal.update({
        where: { id },
        data: { status: statusByType[input.exitType], statusDate: day(input.exitDate), updatedBy: actor },
      });
      await this.event(
        tx, id, statusByType[input.exitType], `timeline.${statusByType[input.exitType]}`,
        { type: input.exitType, price: input.price, cause: input.causeCategory },
        day(input.exitDate), { type: 'exit', id: exit.id },
      );
      await this.audit.log('update', 'Animal', id, { status: 'active' }, { status: statusByType[input.exitType], exit: input }, tx);
      return exit;
    });
  }

  async batchWeigh(input: BatchWeighInput, actor: string) {
    const ids = input.entries.map((e) => e.animalId);
    const animals = await this.prisma.animal.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, tagNumber: true, currentWeightKg: true },
    });
    const byId = new Map(animals.map((a) => [a.id, a]));
    const missing = ids.filter((i) => !byId.has(i));
    if (missing.length) throw AppError.notFound('animal');

    const anomalies = input.entries.flatMap((e) => {
      const last = byId.get(e.animalId)!.currentWeightKg;
      if (last == null) return [];
      const delta = Math.abs(e.weightKg - Number(last)) / Number(last);
      return delta > 0.15 ? [{ animalId: e.animalId, tag: byId.get(e.animalId)!.tagNumber, lastKg: Number(last), newKg: e.weightKg }] : [];
    });
    if (anomalies.length && !input.confirmAnomalies) {
      throw new AppError(422, 'WEIGHT_ANOMALIES', 'errors.weight_anomalies', { anomalies });
    }

    const date = day(input.date);
    await this.prisma.$transaction(async (tx) => {
      for (const e of input.entries) {
        const w = await tx.weightRecord.upsert({
          where: { animalId_weighedOn: { animalId: e.animalId, weighedOn: date } },
          create: { id: ulid(), animalId: e.animalId, weighedOn: date, weightKg: e.weightKg, bcs: e.bcs, createdBy: actor },
          update: { weightKg: e.weightKg, bcs: e.bcs },
        });
        const newer = await tx.weightRecord.findFirst({
          where: { animalId: e.animalId, weighedOn: { gt: date } }, select: { id: true },
        });
        if (!newer) {
          await tx.animal.update({
            where: { id: e.animalId },
            data: { currentWeightKg: e.weightKg, ...(e.bcs !== undefined ? { currentBcs: e.bcs } : {}) },
          });
        }
        await this.event(tx, e.animalId, 'weighed', 'timeline.weighed', { kg: e.weightKg }, date, { type: 'weight', id: w.id });
      }
      await this.audit.log('update', 'WeightRecord', null, null, { date: input.date, count: input.entries.length }, tx);
    }, { timeout: 60000 });
    return { saved: input.entries.length, anomaliesConfirmed: anomalies.length };
  }

  async timeline(animalId: string, cursor?: string, limit = 50) {
    await this.get(animalId);
    const rows = await this.prisma.animalEvent.findMany({
      where: { animalId, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return { data: rows, meta: { nextCursor: rows.length === limit ? rows[rows.length - 1].id : null } };
  }

  async weights(animalId: string) {
    await this.get(animalId);
    return this.prisma.weightRecord.findMany({ where: { animalId }, orderBy: { weighedOn: 'asc' } });
  }

  async stats() {
    const [active, bySex, kids, exits90] = await Promise.all([
      this.prisma.animal.count({ where: { status: 'active', deletedAt: null } }),
      this.prisma.animal.groupBy({ by: ['sex'], where: { status: 'active', deletedAt: null }, _count: true }),
      this.prisma.animal.count({
        where: { status: 'active', deletedAt: null, birthDate: { gt: new Date(Date.now() - 183 * 86400000) } },
      }),
      this.prisma.animalExit.groupBy({
        by: ['exitType'],
        where: { exitDate: { gt: new Date(Date.now() - 90 * 86400000) } },
        _count: true,
      }),
    ]);
    const died90 = exits90.find((e) => e.exitType === 'death')?._count ?? 0;
    return {
      active,
      females: bySex.find((s) => s.sex === 'female')?._count ?? 0,
      males: bySex.find((s) => s.sex === 'male')?._count ?? 0,
      kidsUnder6m: kids,
      died90d: died90,
      mortality90dPct: active + died90 > 0 ? Math.round((died90 / (active + died90)) * 1000) / 10 : 0,
    };
  }
}
