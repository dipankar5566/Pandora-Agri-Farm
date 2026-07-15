import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { CreatePenInput, CreateShedInput } from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

type PenInput = z.infer<typeof CreatePenInput>;
type ShedInput = z.infer<typeof CreateShedInput>;

@Injectable()
export class LookupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  breeds() {
    return this.prisma.breed.findMany({ orderBy: { name: 'asc' } });
  }

  async pens() {
    const pens = await this.prisma.pen.findMany({
      include: {
        shed: { select: { name: true } },
        _count: { select: { animals: { where: { status: 'active', deletedAt: null } } } },
      },
      orderBy: [{ shedId: 'asc' }, { name: 'asc' }],
    });
    return pens.map((p) => ({ ...p, occupancy: p._count.animals }));
  }

  sheds() {
    return this.prisma.shed.findMany({ include: { pens: { select: { id: true, name: true, purpose: true } } } });
  }

  async createPen(input: PenInput, actor: string) {
    const shed = await this.prisma.shed.findUnique({ where: { id: input.shedId } });
    if (!shed) throw AppError.notFound('shed');
    const clash = await this.prisma.pen.findUnique({
      where: { shedId_name: { shedId: input.shedId, name: input.name } },
    });
    if (clash) throw AppError.conflict('PEN_NAME_TAKEN');
    const pen = await this.prisma.pen.create({ data: { id: ulid(), ...input } });
    await this.audit.log('create', 'Pen', pen.id, null, input);
    return pen;
  }

  async createShed(input: ShedInput, actor: string) {
    const clash = await this.prisma.shed.findUnique({ where: { name: input.name } });
    if (clash) throw AppError.conflict('SHED_NAME_TAKEN');
    const shed = await this.prisma.shed.create({ data: { id: ulid(), ...input } });
    await this.audit.log('create', 'Shed', shed.id, null, input);
    return shed;
  }
}
