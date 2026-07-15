import { Injectable } from '@nestjs/common';
import { hasLevel, PermLevel } from '../../common/rbac';
import { PrismaService } from '../../prisma.service';

const LIMIT = 8;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Universal search (Phase 1 §4) — one query fanning out to every
   * searchable entity, each group gated by the caller's own module
   * permission so results never leak past what the UI would show anyway.
   */
  async search(q: string, perms: Array<{ module: string; level: PermLevel }>) {
    const like = `%${q}%`;
    const [animals, items, suppliers, tasks, ledger] = await Promise.all([
      hasLevel(perms, 'livestock', 'view')
        ? this.prisma.animal.findMany({
            where: { deletedAt: null, OR: [{ tagNumber: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] },
            select: { id: true, tagNumber: true, name: true, status: true },
            take: LIMIT,
          })
        : null,
      hasLevel(perms, 'inventory', 'view')
        ? this.prisma.item.findMany({
            where: { deletedAt: null, name: { contains: q, mode: 'insensitive' } },
            select: { id: true, name: true, itemType: true, unit: true },
            take: LIMIT,
          })
        : null,
      hasLevel(perms, 'inventory', 'view')
        ? this.prisma.supplier.findMany({
            where: { deletedAt: null, name: { contains: q, mode: 'insensitive' } },
            select: { id: true, name: true, phone: true },
            take: LIMIT,
          })
        : null,
      hasLevel(perms, 'tasks', 'view')
        ? this.prisma.task.findMany({
            where: { title: { contains: q, mode: 'insensitive' } },
            select: { id: true, title: true, status: true, dueOn: true },
            take: LIMIT,
          })
        : null,
      hasLevel(perms, 'finance', 'view')
        ? this.prisma.ledgerEntry.findMany({
            where: {
              deletedAt: null,
              OR: [{ description: { contains: q, mode: 'insensitive' } }, { counterpartyName: { contains: q, mode: 'insensitive' } }],
            },
            select: { id: true, description: true, counterpartyName: true, amount: true, kind: true, entryDate: true },
            take: LIMIT,
          })
        : null,
    ]);

    const groups: Record<string, unknown> = {};
    if (animals) groups.animals = animals;
    if (items) groups.items = items;
    if (suppliers) groups.suppliers = suppliers;
    if (tasks) groups.tasks = tasks;
    if (ledger) groups.ledger = ledger;
    return groups;
  }
}
