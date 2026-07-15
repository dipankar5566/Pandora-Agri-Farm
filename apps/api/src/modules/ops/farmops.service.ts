import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ulid } from 'ulid';
import type {
  CompleteTaskInput, CreateLedgerEntryInput, CreateTaskInput,
  SaveFeedDayInput, SkipTaskInput, UpdateLedgerEntryInput,
} from '@pandora/contracts';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../prisma.service';

const execFileP = promisify(execFile);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
type CompleteTask = z.infer<typeof CompleteTaskInput>;
type SkipTask = z.infer<typeof SkipTaskInput>;

const PG_DUMP = process.env.PG_DUMP ?? '/Applications/Postgres.app/Contents/Versions/16/bin/pg_dump';
const BACKUP_DIR = process.env.BACKUP_DIR ?? join(process.env.HOME ?? '/tmp', 'PandoraBackups');
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 30);

@Injectable()
export class FarmOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  // ── feed register ──────────────────────────────────────────────────
  async feedDay(date: string) {
    const rows = await this.prisma.feedLog.findMany({ where: { fedOn: day(date) } });
    return rows;
  }

  /** Upsert the day's register; stock is consumed for new/increased rows. */
  async saveFeedDay(input: SaveFeedDayInput, actor: string) {
    const fedOn = day(input.date);
    const pens = await this.prisma.pen.findMany({ where: { id: { in: input.rows.map((r) => r.penId) } } });
    if (pens.length !== new Set(input.rows.map((r) => r.penId)).size) throw AppError.notFound('pen');

    return this.prisma.$transaction(async (tx) => {
      let saved = 0;
      for (const row of input.rows) {
        const existing = await tx.feedLog.findUnique({
          where: { fedOn_penId_itemId: { fedOn, penId: row.penId, itemId: row.itemId } },
        });
        const delta = row.qty - Number(existing?.qty ?? 0);
        if (existing) {
          await tx.feedLog.update({
            where: { id: existing.id },
            data: { qty: row.qty, wastageQty: row.wastageQty },
          });
        } else {
          await tx.feedLog.create({
            data: {
              id: ulid(), fedOn, penId: row.penId, itemId: row.itemId,
              qty: row.qty, wastageQty: row.wastageQty, createdBy: actor,
            },
          });
        }
        if (delta > 0) {
          await this.inventory.consume(tx, row.itemId, delta, { type: 'feed_log', id: `${input.date}:${row.penId}` }, { onDate: fedOn, actor });
        }
        // Reductions are corrected via inventory adjustment (rare; keeps ledger append-only).
        saved++;
      }
      await this.audit.log('create', 'FeedLog', null, null, { date: input.date, rows: saved }, tx);
      return { saved };
    }, { timeout: 30000 });
  }

  // ── finance ────────────────────────────────────────────────────────
  categories() {
    return this.prisma.financeCategory.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  }

  async listLedger(opts: { month?: string; kind?: string; cursor?: string; limit?: number }) {
    const where: Prisma.LedgerEntryWhereInput = {
      deletedAt: null,
      ...(opts.kind ? { kind: opts.kind as never } : {}),
      ...(opts.month
        ? {
            entryDate: {
              gte: day(`${opts.month}-01`),
              lt: new Date(new Date(`${opts.month}-01`).setMonth(new Date(`${opts.month}-01`).getMonth() + 1)),
            },
          }
        : {}),
      ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
    };
    const take = Math.min(opts.limit ?? 50, 200);
    const rows = await this.prisma.ledgerEntry.findMany({
      where, include: { category: { select: { name: true, nameBn: true } } },
      orderBy: { id: 'desc' }, take,
    });
    return { data: rows, meta: { nextCursor: rows.length === take ? rows[rows.length - 1].id : null } };
  }

  async createEntry(input: CreateLedgerEntryInput, actor: string, ref?: { type: string; id: string }) {
    const cat = await this.prisma.financeCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw AppError.notFound('category');
    if (cat.kind !== input.kind) throw AppError.conflict('CATEGORY_KIND_MISMATCH');
    const entry = await this.prisma.ledgerEntry.create({
      data: {
        id: ulid(), entryDate: day(input.entryDate), kind: input.kind, categoryId: input.categoryId,
        amount: input.amount, paymentMethod: input.paymentMethod,
        counterpartyName: input.counterpartyName, animalId: input.animalId,
        description: input.description, refType: ref?.type, refId: ref?.id, createdBy: actor,
      },
    });
    await this.audit.log('create', 'LedgerEntry', entry.id, null, input);
    return entry;
  }

  async updateEntry(id: string, input: UpdateLedgerEntryInput, actor: string) {
    const before = await this.prisma.ledgerEntry.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('entry');
    if (before.refType) throw AppError.conflict('AUTO_ENTRY_READONLY'); // edited via source record
    const entry = await this.prisma.ledgerEntry.update({
      where: { id },
      data: { ...input, entryDate: input.entryDate ? day(input.entryDate) : undefined, updatedBy: actor },
    });
    await this.audit.log('update', 'LedgerEntry', id, before, input);
    return entry;
  }

  async summary(month: string) {
    const start = day(`${month}-01`);
    const end = new Date(new Date(start).setMonth(start.getMonth() + 1));
    const groups = await this.prisma.ledgerEntry.groupBy({
      by: ['kind', 'categoryId'],
      where: { deletedAt: null, entryDate: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    const cats = await this.prisma.financeCategory.findMany();
    const catById = new Map(cats.map((c) => [c.id, c]));
    const income = groups.filter((g) => g.kind === 'income');
    const expense = groups.filter((g) => g.kind === 'expense');
    const sum = (rows: typeof groups) => rows.reduce((n, r) => n + Number(r._sum.amount ?? 0), 0);
    const active = await this.prisma.animal.count({ where: { status: 'active', deletedAt: null } });
    const totalExpense = sum(expense);
    return {
      month,
      income: sum(income),
      expense: totalExpense,
      net: sum(income) - totalExpense,
      costPerGoat: active > 0 ? Math.round(totalExpense / active) : null,
      byCategory: groups.map((g) => ({
        kind: g.kind,
        category: catById.get(g.categoryId)?.name,
        categoryBn: catById.get(g.categoryId)?.nameBn,
        total: Number(g._sum.amount ?? 0),
      })).sort((a, b) => b.total - a.total),
    };
  }

  // NOTE: exit-sale income booking moved to SalesService.cashSaleFromExit
  // (R2 Module 1) — every sale now flows invoice → payment → ledger.

  // ── tasks ──────────────────────────────────────────────────────────
  async listTasks(dateStr: string) {
    const date = day(dateStr);
    const rows = await this.prisma.task.findMany({
      where: { OR: [{ dueOn: { lte: date }, status: 'pending' }, { dueOn: date }] },
      orderBy: [{ status: 'asc' }, { dueOn: 'asc' }],
      take: 200,
    });
    return rows.map((r) => ({
      ...r,
      overdueDays: r.status === 'pending' ? Math.max(0, Math.floor((date.getTime() - r.dueOn.getTime()) / 86400000)) : 0,
    }));
  }

  async createTask(input: CreateTaskInput, actor: string) {
    const task = await this.prisma.task.create({
      data: { id: ulid(), ...input, dueOn: day(input.dueOn), createdBy: actor },
    });
    await this.audit.log('create', 'Task', task.id, null, input);
    return task;
  }

  async completeTask(id: string, input: CompleteTask, actor: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw AppError.notFound('task');
    if (task.status !== 'pending') throw AppError.conflict('TASK_NOT_PENDING');
    const done = await this.prisma.task.update({
      where: { id },
      data: { status: 'done', completedAt: new Date(), completedBy: actor, completionNotes: input.notes },
    });
    // Recurring: schedule the next occurrence.
    if (task.recurrence === 'daily' || task.recurrence === 'weekly') {
      const next = new Date(task.dueOn.getTime() + (task.recurrence === 'daily' ? 1 : 7) * 86400000);
      await this.prisma.task.create({
        data: {
          id: ulid(), title: task.title, taskType: task.taskType, dueOn: next,
          animalId: task.animalId, penId: task.penId, assignedTo: task.assignedTo,
          recurrence: task.recurrence, createdBy: actor,
        },
      });
    }
    await this.audit.log('update', 'Task', id, { status: 'pending' }, { status: 'done' });
    return done;
  }

  async skipTask(id: string, input: SkipTask, actor: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw AppError.notFound('task');
    if (task.status !== 'pending') throw AppError.conflict('TASK_NOT_PENDING');
    const skipped = await this.prisma.task.update({
      where: { id },
      data: { status: 'skipped', skipReason: input.reason, completedBy: actor },
    });
    await this.audit.log('update', 'Task', id, { status: 'pending' }, { status: 'skipped', reason: input.reason });
    return skipped;
  }

  // ── dashboard (one aggregated call, Phase 5 §2.8) ─────────────────
  async dashboard() {
    const now = new Date();
    const in60d = new Date(now.getTime() + 60 * 86400000);
    const [
      active, bySex, kids, exits90, duesPending, duesOverdue, pregnancies,
      openCases, lowStockCount, expiringCount, monthSummary, tasksToday, lastBackup,
    ] = await Promise.all([
      this.prisma.animal.count({ where: { status: 'active', deletedAt: null } }),
      this.prisma.animal.groupBy({ by: ['sex'], where: { status: 'active', deletedAt: null }, _count: true }),
      this.prisma.animal.count({ where: { status: 'active', deletedAt: null, birthDate: { gt: new Date(now.getTime() - 183 * 86400000) } } }),
      this.prisma.animalExit.count({ where: { exitType: 'death', exitDate: { gt: new Date(now.getTime() - 90 * 86400000) } } }),
      this.prisma.protocolDue.count({ where: { status: 'pending', dueDate: { lte: in60d } } }),
      this.prisma.protocolDue.count({ where: { status: 'pending', dueDate: { lt: now } } }),
      this.prisma.pregnancy.findMany({
        where: { status: 'ongoing', expectedKiddingDate: { lte: in60d } },
        orderBy: { expectedKiddingDate: 'asc' }, take: 8,
      }),
      this.prisma.healthCase.count({ where: { status: { in: ['open', 'monitoring'] } } }),
      this.inventory.listItems({ belowMin: true }).then((r) => r.length),
      this.inventory.expiring(30).then((r) => r.length),
      this.summary(now.toISOString().slice(0, 7)),
      this.prisma.task.count({ where: { status: 'pending', dueOn: { lte: now } } }),
      this.prisma.setting.findUnique({ where: { key: 'backup.lastSuccessAt' } }).catch(() => null),
    ]);
    const does = await this.prisma.animal.findMany({
      where: { id: { in: pregnancies.map((p) => p.doeId) } },
      select: { id: true, tagNumber: true },
    });
    const doeById = new Map(does.map((d) => [d.id, d.tagNumber]));
    const died = exits90;
    return {
      herd: {
        active,
        females: bySex.find((s) => s.sex === 'female')?._count ?? 0,
        males: bySex.find((s) => s.sex === 'male')?._count ?? 0,
        kidsUnder6m: kids,
        mortality90dPct: active + died > 0 ? Math.round((died / (active + died)) * 1000) / 10 : 0,
      },
      attention: {
        duesOverdue, duesPending60d: duesPending, openCases, lowStockItems: lowStockCount,
        expiringBatches30d: expiringCount, tasksDueToday: tasksToday,
      },
      upcomingKiddings: pregnancies.map((p) => ({
        pregnancyId: p.id, doeId: p.doeId, doeTag: doeById.get(p.doeId),
        expected: p.expectedKiddingDate.toISOString().slice(0, 10),
      })),
      money: { month: monthSummary.month, income: monthSummary.income, expense: monthSummary.expense, net: monthSummary.net, costPerGoat: monthSummary.costPerGoat },
      backup: { lastSuccessAt: (lastBackup?.value as { at?: string } | null)?.at ?? null },
    };
  }

  // ── backup (Phase 2 §5) ────────────────────────────────────────────
  async runBackup(actor: string | null) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = join(BACKUP_DIR, `pandora-${stamp}.dump`);
    const url = process.env.DATABASE_URL ?? '';
    await execFileP(PG_DUMP, ['-Fc', '-f', file, '--dbname', url]);
    const size = statSync(file).size;
    if (size < 1024) throw new AppError(500, 'BACKUP_TOO_SMALL', 'errors.backup_failed');

    // Rotate: keep newest BACKUP_KEEP dumps.
    const dumps = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.dump')).sort();
    for (const old of dumps.slice(0, Math.max(0, dumps.length - BACKUP_KEEP))) {
      unlinkSync(join(BACKUP_DIR, old));
    }
    const at = new Date().toISOString();
    await this.prisma.setting.upsert({
      where: { key: 'backup.lastSuccessAt' },
      create: { key: 'backup.lastSuccessAt', value: { at, file, sizeBytes: size } },
      update: { value: { at, file, sizeBytes: size } },
    });
    await this.audit.log('backup', 'Backup', null, null, { file, sizeBytes: size });
    return { file, sizeBytes: size, at, kept: Math.min(dumps.length, BACKUP_KEEP) };
  }
}
