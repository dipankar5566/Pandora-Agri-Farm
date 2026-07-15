import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import type {
  RecordAbortionInput, RecordDiagnosisInput, RecordHeatInput,
  RecordKiddingInput, RecordServiceInput,
} from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

@Injectable()
export class BreedingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

  private async activeDoe(id: string) {
    const doe = await this.prisma.animal.findFirst({
      where: { id, deletedAt: null },
      include: { breed: true },
    });
    if (!doe) throw AppError.notFound('doe');
    if (doe.sex !== 'female') throw AppError.conflict('NOT_A_DOE');
    if (doe.status !== 'active') throw AppError.conflict('ANIMAL_NOT_ACTIVE');
    return doe;
  }

  // ── heats ────────────────────────────────────────────────────────
  async recordHeat(input: RecordHeatInput, actor: string) {
    const doe = await this.activeDoe(input.doeId);
    return this.prisma.$transaction(async (tx) => {
      const heat = await tx.heatRecord.create({
        data: {
          id: ulid(), doeId: doe.id, detectedOn: day(input.detectedOn),
          signs: input.signs, notes: input.notes, createdBy: actor,
        },
      });
      await this.event(tx, doe.id, 'heat', 'timeline.heat', {}, day(input.detectedOn), { type: 'heat', id: heat.id });
      await this.audit.log('create', 'HeatRecord', heat.id, null, { doe: doe.tagNumber, on: input.detectedOn }, tx);
      return heat;
    });
  }

  async listHeats(days = 30) {
    const since = addDays(new Date(), -days);
    const heats = await this.prisma.heatRecord.findMany({
      where: { detectedOn: { gte: since } },
      orderBy: { detectedOn: 'desc' },
    });
    const doeIds = [...new Set(heats.map((h) => h.doeId))];
    const [does, services] = await Promise.all([
      this.prisma.animal.findMany({
        where: { id: { in: doeIds } },
        select: { id: true, tagNumber: true, name: true },
      }),
      this.prisma.service.findMany({
        where: { heatRecordId: { in: heats.map((h) => h.id) } },
        select: { heatRecordId: true, id: true },
      }),
    ]);
    const doeById = new Map(does.map((d) => [d.id, d]));
    const served = new Set(services.map((s) => s.heatRecordId));
    return heats.map((h) => ({
      ...h,
      doe: doeById.get(h.doeId),
      served: served.has(h.id),
      // No return-to-heat by day 19–21 after service ⇒ likely pregnant; until then recheck.
      recheckDue: addDays(new Date(h.detectedOn), 19).toISOString().slice(0, 10),
    }));
  }

  // ── services ─────────────────────────────────────────────────────
  /** Shared ancestor within 2 generations (Phase 1 §5.2 inbreeding guard). */
  private async sharedAncestry(tx: Tx, doeId: string, buckId: string): Promise<boolean> {
    const ancestors = async (id: string): Promise<Set<string>> => {
      const out = new Set<string>();
      let frontier = [id];
      for (let gen = 0; gen < 2 && frontier.length; gen++) {
        const rows = await tx.animal.findMany({
          where: { id: { in: frontier } },
          select: { damId: true, sireId: true },
        });
        frontier = rows.flatMap((r) => [r.damId, r.sireId]).filter((x): x is string => !!x);
        frontier.forEach((a) => out.add(a));
      }
      return out;
    };
    const [doeAnc, buckAnc] = await Promise.all([ancestors(doeId), ancestors(buckId)]);
    doeAnc.add(doeId); // buck being the doe's parent (or vice versa) also counts
    buckAnc.add(buckId);
    return [...doeAnc].some((a) => buckAnc.has(a));
  }

  async recordService(input: RecordServiceInput, actor: string) {
    const doe = await this.activeDoe(input.doeId);

    const ongoing = await this.prisma.pregnancy.findFirst({ where: { doeId: doe.id, status: 'ongoing' } });
    if (ongoing) throw AppError.conflict('PREGNANCY_ALREADY_ONGOING');

    let buck: { id: string; tagNumber: string } | null = null;
    if (input.serviceType === 'natural') {
      const b = await this.prisma.animal.findFirst({ where: { id: input.buckId!, deletedAt: null } });
      if (!b) throw AppError.notFound('buck');
      if (b.sex !== 'male') throw AppError.conflict('NOT_A_BUCK');
      if (b.status !== 'active') throw AppError.conflict('ANIMAL_NOT_ACTIVE');
      buck = { id: b.id, tagNumber: b.tagNumber };
    }

    // Soft biology rules → 422 unless confirmed with a reason (Phase 5 §1.4).
    const warnings: string[] = [];
    const ageDays = Math.floor((Date.now() - doe.birthDate.getTime()) / 86400000);
    if (doe.breed.pubertyAgeDays && ageDays < doe.breed.pubertyAgeDays) warnings.push('DOE_UNDERAGE');
    if (
      doe.breed.adultWeightKg && doe.currentWeightKg &&
      Number(doe.currentWeightKg) < 0.6 * Number(doe.breed.adultWeightKg)
    ) warnings.push('DOE_UNDERWEIGHT');
    let inbreeding = false;
    if (buck) {
      inbreeding = await this.sharedAncestry(this.prisma, doe.id, buck.id);
      if (inbreeding) warnings.push('INBREEDING_RISK');
    }
    if (warnings.length && !input.confirmOverride) {
      throw new AppError(422, 'RULE_OVERRIDE_REQUIRED', 'errors.rule_override_required', { warnings });
    }

    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          id: ulid(), doeId: doe.id, serviceType: input.serviceType, buckId: buck?.id,
          semenBatch: input.semenBatch, semenSource: input.semenSource, technician: input.technician,
          serviceDate: day(input.serviceDate), heatRecordId: input.heatRecordId,
          inbreedingFlag: inbreeding,
          overrideReason: warnings.length ? input.overrideReason : undefined,
          notes: input.notes, createdBy: actor,
        },
      });
      await this.event(
        tx, doe.id, 'served', 'timeline.served',
        { type: input.serviceType, buck: buck?.tagNumber ?? input.semenBatch },
        day(input.serviceDate), { type: 'service', id: service.id },
      );
      await this.audit.log('create', 'Service', service.id, null, { doe: doe.tagNumber, ...input }, tx);
      return { ...service, expectedKiddingIfPregnant: addDays(day(input.serviceDate), doe.breed.gestationDays).toISOString().slice(0, 10), warnings };
    });
  }

  // ── diagnosis → pregnancy ────────────────────────────────────────
  async recordDiagnosis(serviceId: string, input: RecordDiagnosisInput, actor: string) {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: { pregnancy: true },
    });
    if (!service) throw AppError.notFound('service');
    const doe = await this.activeDoe(service.doeId);
    const diagnosedOn = day(input.diagnosedOn);
    if (diagnosedOn < addDays(service.serviceDate, 18)) {
      throw new AppError(400, 'DIAGNOSIS_TOO_EARLY', 'errors.diagnosis_too_early', { minDays: 18 });
    }
    if (service.pregnancy) throw AppError.conflict('ALREADY_DIAGNOSED_PREGNANT');

    return this.prisma.$transaction(async (tx) => {
      const diag = await tx.pregnancyDiagnosis.create({
        data: {
          id: ulid(), serviceId, diagnosedOn, method: input.method,
          result: input.result, notes: input.notes, createdBy: actor,
        },
      });
      let pregnancy = null;
      if (input.result === 'pregnant') {
        const ongoing = await tx.pregnancy.findFirst({ where: { doeId: doe.id, status: 'ongoing' } });
        if (ongoing) throw AppError.conflict('PREGNANCY_ALREADY_ONGOING');
        pregnancy = await tx.pregnancy.create({
          data: {
            id: ulid(), doeId: doe.id, serviceId, confirmedOn: diagnosedOn,
            expectedKiddingDate: addDays(service.serviceDate, doe.breed.gestationDays),
            createdBy: actor,
          },
        });
      }
      await this.event(
        tx, doe.id, 'pregnancy_diagnosed', 'timeline.pregnancy_diagnosed',
        { result: input.result, method: input.method }, diagnosedOn, { type: 'diagnosis', id: diag.id },
      );
      await this.audit.log('create', 'PregnancyDiagnosis', diag.id, null, { doe: doe.tagNumber, ...input }, tx);
      return { diagnosis: diag, pregnancy };
    });
  }

  async listPregnancies(status = 'ongoing', dueWithinDays?: number) {
    const where: Prisma.PregnancyWhereInput = {
      status: status as never,
      ...(dueWithinDays
        ? { expectedKiddingDate: { lte: addDays(new Date(), dueWithinDays) } }
        : {}),
    };
    const rows = await this.prisma.pregnancy.findMany({
      where,
      include: { service: { select: { serviceDate: true, serviceType: true, buckId: true } } },
      orderBy: { expectedKiddingDate: 'asc' },
    });
    const does = await this.prisma.animal.findMany({
      where: { id: { in: rows.map((r) => r.doeId) } },
      select: { id: true, tagNumber: true, name: true },
    });
    const byId = new Map(does.map((d) => [d.id, d]));
    return rows.map((p) => ({
      ...p,
      doe: byId.get(p.doeId),
      daysPregnant: Math.floor((Date.now() - p.service.serviceDate.getTime()) / 86400000),
    }));
  }

  // ── kidding: one transaction creates kids + records + events ────
  async recordKidding(pregnancyId: string, input: RecordKiddingInput, actor: string) {
    const pregnancy = await this.prisma.pregnancy.findUnique({
      where: { id: pregnancyId },
      include: { service: true },
    });
    if (!pregnancy) throw AppError.notFound('pregnancy');
    if (pregnancy.status !== 'ongoing') throw AppError.conflict('PREGNANCY_NOT_ONGOING');
    const doe = await this.activeDoe(pregnancy.doeId);
    const kiddingDate = day(input.kiddingDate);
    if (kiddingDate < pregnancy.service.serviceDate) throw AppError.conflict('KIDDING_BEFORE_SERVICE');

    const premature = kiddingDate < addDays(pregnancy.service.serviceDate, doe.breed.gestationDays - 10);
    if (premature && !input.confirmOverride) {
      throw new AppError(422, 'RULE_OVERRIDE_REQUIRED', 'errors.rule_override_required', { warnings: ['PREMATURE_KIDDING'] });
    }

    return this.prisma.$transaction(async (tx) => {
      const kidding = await tx.kidding.create({
        data: {
          id: ulid(), pregnancyId, kiddingDate, assisted: input.assisted,
          complication: input.complication, complicationNotes: input.complicationNotes,
          totalBorn: input.totalBorn, bornAlive: input.bornAlive,
          notes: input.notes, createdBy: actor,
        },
      });
      await tx.pregnancy.update({ where: { id: pregnancyId }, data: { status: 'kidded' } });

      const kids: Array<{ id: string; tagNumber: string }> = [];
      let order = 0;
      for (const kid of input.kids) {
        order += 1;
        let tagNumber = kid.tagNumber ?? undefined;
        if (tagNumber) {
          const clash = await tx.animal.findFirst({ where: { tagNumber, deletedAt: null } });
          if (clash) throw AppError.conflict('TAG_TAKEN', { tag: tagNumber });
        } else {
          tagNumber = await this.nextTag(tx);
        }
        const kidId = ulid();
        await tx.animal.create({
          data: {
            id: kidId, tagNumber, name: kid.name, breedId: doe.breedId, sex: kid.sex,
            birthDate: kiddingDate, source: 'born_on_farm',
            damId: doe.id, sireId: pregnancy.service.buckId,
            currentPenId: doe.currentPenId, status: 'active', statusDate: kiddingDate,
            currentWeightKg: kid.birthWeightKg, createdBy: actor,
          },
        });
        await tx.kidRecord.create({
          data: {
            animalId: kidId, kiddingId: kidding.id, birthOrder: order,
            birthWeightKg: kid.birthWeightKg, colostrumWithin1h: input.colostrumWithin1h,
          },
        });
        if (kid.birthWeightKg !== undefined) {
          await tx.weightRecord.create({
            data: { id: ulid(), animalId: kidId, weighedOn: kiddingDate, weightKg: kid.birthWeightKg, method: 'scale', createdBy: actor },
          });
        }
        await this.event(tx, kidId, 'kid_born', 'timeline.kid_born', { dam: doe.tagNumber, order }, kiddingDate, { type: 'kidding', id: kidding.id });
        kids.push({ id: kidId, tagNumber });
      }

      await this.event(
        tx, doe.id, 'kidded', 'timeline.kidded',
        { total: input.totalBorn, alive: input.bornAlive, kids: kids.map((k) => k.tagNumber) },
        kiddingDate, { type: 'kidding', id: kidding.id },
      );
      // Kid-care tasks (Phase 1 §5.3: kid mortality is the #1 economic risk).
      if (kids.length) {
        await tx.task.createMany({
          data: [
            {
              id: ulid(), title: `Colostrum & navel check — ${kids.map((k) => k.tagNumber).join(', ')}`,
              taskType: 'inspection', dueOn: kiddingDate, animalId: kids[0].id, createdBy: actor,
            },
            {
              id: ulid(), title: `Dam check after kidding — ${doe.tagNumber}`,
              taskType: 'inspection', dueOn: new Date(kiddingDate.getTime() + 86400000),
              animalId: doe.id, createdBy: actor,
            },
            {
              id: ulid(), title: `Kid weight day 7 — ${kids.map((k) => k.tagNumber).join(', ')}`,
              taskType: 'inspection', dueOn: new Date(kiddingDate.getTime() + 7 * 86400000),
              animalId: kids[0].id, createdBy: actor,
            },
          ],
        });
      }
      await this.audit.log('create', 'Kidding', kidding.id, null, { doe: doe.tagNumber, totalBorn: input.totalBorn, bornAlive: input.bornAlive, kids: kids.map((k) => k.tagNumber) }, tx);
      return { kidding, kidsCreated: kids, stillborn: input.totalBorn - input.bornAlive };
    }, { timeout: 30000 });
  }

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

  async recordAbortion(pregnancyId: string, input: RecordAbortionInput, actor: string) {
    const pregnancy = await this.prisma.pregnancy.findUnique({ where: { id: pregnancyId } });
    if (!pregnancy) throw AppError.notFound('pregnancy');
    if (pregnancy.status !== 'ongoing') throw AppError.conflict('PREGNANCY_NOT_ONGOING');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pregnancy.update({
        where: { id: pregnancyId },
        data: { status: 'aborted', abortionDate: day(input.abortionDate), abortionReason: input.reason },
      });
      await this.event(tx, pregnancy.doeId, 'aborted', 'timeline.aborted', { reason: input.reason }, day(input.abortionDate), { type: 'pregnancy', id: pregnancyId });
      await this.audit.log('update', 'Pregnancy', pregnancyId, { status: 'ongoing' }, { status: 'aborted', ...input }, tx);
      return updated;
    });
  }

  // ── performance (computed, never stored) ─────────────────────────
  async performance(by: 'doe' | 'buck') {
    const services = await this.prisma.service.findMany({
      include: { diagnoses: true, pregnancy: { include: { kidding: true } } },
    });
    const key = by === 'doe' ? 'doeId' : 'buckId';
    const groups = new Map<string, typeof services>();
    for (const s of services) {
      const k = s[key];
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(s);
    }
    const animals = await this.prisma.animal.findMany({
      where: { id: { in: [...groups.keys()] } },
      select: { id: true, tagNumber: true, name: true, status: true },
    });
    const byId = new Map(animals.map((a) => [a.id, a]));
    return [...groups.entries()].map(([animalId, svcs]) => {
      const diagnosed = svcs.filter((s) => s.diagnoses.length > 0);
      const pregnant = svcs.filter((s) => s.pregnancy);
      const kidded = svcs.filter((s) => s.pregnancy?.kidding);
      const kidsBorn = kidded.reduce((n, s) => n + (s.pregnancy!.kidding!.bornAlive ?? 0), 0);
      // Repeat breeder: 3+ consecutive most-recent services diagnosed open.
      const recent = [...svcs].sort((a, b) => b.serviceDate.getTime() - a.serviceDate.getTime());
      let openStreak = 0;
      for (const s of recent) {
        const lastDiag = s.diagnoses.sort((a, b) => b.diagnosedOn.getTime() - a.diagnosedOn.getTime())[0];
        if (lastDiag?.result === 'open') openStreak += 1;
        else break;
      }
      return {
        animal: byId.get(animalId),
        services: svcs.length,
        diagnosed: diagnosed.length,
        conceptionRatePct: diagnosed.length ? Math.round((pregnant.length / diagnosed.length) * 100) : null,
        kiddings: kidded.length,
        kidsBorn,
        avgLitterSize: kidded.length ? Math.round((kidsBorn / kidded.length) * 10) / 10 : null,
        repeatBreeder: openStreak >= 3,
      };
    }).sort((a, b) => b.services - a.services);
  }
}
