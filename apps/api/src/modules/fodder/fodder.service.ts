import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type {
  CloseCropInput, CreatePlotInput, RecordHarvestInput, SowCropInput, UpdatePlotInput,
} from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

@Injectable()
export class FodderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── plots ──────────────────────────────────────────────────────────
  async listPlots() {
    const plots = await this.prisma.fodderPlot.findMany({
      where: { deletedAt: null },
      include: { crops: { where: { status: 'growing' }, select: { id: true, cropName: true } } },
      orderBy: { name: 'asc' },
    });
    return plots.map((p) => ({ ...p, growing: p.crops, crops: undefined }));
  }

  async createPlot(input: CreatePlotInput, actor: string) {
    const clash = await this.prisma.fodderPlot.findFirst({ where: { name: input.name, deletedAt: null } });
    if (clash) throw AppError.conflict('PLOT_NAME_TAKEN');
    const plot = await this.prisma.fodderPlot.create({ data: { id: ulid(), ...input, createdBy: actor } });
    await this.audit.log('create', 'FodderPlot', plot.id, null, input);
    return plot;
  }

  async updatePlot(id: string, input: UpdatePlotInput, actor: string) {
    const before = await this.prisma.fodderPlot.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('plot');
    const plot = await this.prisma.fodderPlot.update({ where: { id }, data: { ...input, updatedBy: actor } });
    await this.audit.log('update', 'FodderPlot', id, before, input);
    return plot;
  }

  // ── crops ──────────────────────────────────────────────────────────
  async listCrops(status?: string) {
    const crops = await this.prisma.fodderCrop.findMany({
      where: status ? { status: status as never } : {},
      include: {
        plot: { select: { name: true, block: true } },
        harvests: { select: { qtyKg: true, harvestedOn: true, form: true } },
      },
      orderBy: { sownOn: 'desc' },
      take: 100,
    });
    const today = Date.now();
    return crops.map((c) => ({
      ...c,
      ageDays: Math.floor((today - c.sownOn.getTime()) / 86400000),
      totalYieldKg: c.harvests.reduce((n, h) => n + Number(h.qtyKg), 0),
      cuts: c.harvests.length,
      harvests: undefined,
    }));
  }

  async sowCrop(input: SowCropInput, actor: string) {
    const plot = await this.prisma.fodderPlot.findFirst({ where: { id: input.plotId, deletedAt: null } });
    if (!plot) throw AppError.notFound('plot');
    const crop = await this.prisma.fodderCrop.create({
      data: {
        id: ulid(), ...input,
        sownOn: day(input.sownOn),
        expectedHarvestOn: input.expectedHarvestOn ? day(input.expectedHarvestOn) : undefined,
        createdBy: actor,
      },
    });
    await this.audit.log('create', 'FodderCrop', crop.id, null, { plot: plot.name, ...input });
    return crop;
  }

  async closeCrop(id: string, input: CloseCropInput, actor: string) {
    const crop = await this.prisma.fodderCrop.findUnique({ where: { id } });
    if (!crop) throw AppError.notFound('crop');
    if (crop.status !== 'growing') throw AppError.conflict('CROP_NOT_GROWING');
    const closed = await this.prisma.fodderCrop.update({
      where: { id },
      data: {
        status: input.status, closedOn: day(input.closedOn),
        failReason: input.failReason, costTotal: input.costTotal ?? crop.costTotal,
      },
    });
    await this.audit.log('update', 'FodderCrop', id, { status: 'growing' }, input);
    return closed;
  }

  /**
   * A harvest lands as feed stock: batch + 'production' movement in one tx.
   * Own production carries zero unit cost (crop costs live on the crop; feed
   * cost analytics treat home-grown fodder at cost of production, not price).
   */
  async recordHarvest(cropId: string, input: RecordHarvestInput, actor: string) {
    const crop = await this.prisma.fodderCrop.findUnique({
      where: { id: cropId },
      include: { plot: { select: { name: true } } },
    });
    if (!crop) throw AppError.notFound('crop');
    if (crop.status !== 'growing') throw AppError.conflict('CROP_NOT_GROWING');
    const item = await this.prisma.item.findFirst({ where: { id: input.itemId, deletedAt: null } });
    if (!item) throw AppError.notFound('item');
    if (!['feed', 'supplement', 'mineral'].includes(item.itemType)) {
      throw AppError.conflict('NOT_A_FEED_ITEM');
    }
    const harvestedOn = day(input.harvestedOn);
    if (harvestedOn < crop.sownOn) throw AppError.conflict('HARVEST_BEFORE_SOWING');

    return this.prisma.$transaction(async (tx) => {
      const harvestId = ulid();
      const batch = await tx.itemBatch.create({
        data: {
          id: ulid(), itemId: item.id,
          batchNo: `${crop.cropName.slice(0, 12)}-${input.harvestedOn}`,
          receivedOn: harvestedOn,
          qtyReceived: input.qtyKg, qtyRemaining: 0, // trigger fills via movement
          unitCost: 0, createdBy: actor,
        },
      });
      await tx.stockMovement.create({
        data: {
          id: ulid(), itemId: item.id, batchId: batch.id, movementType: 'production',
          qty: input.qtyKg, refType: 'fodder_harvest', refId: harvestId,
          movedAt: harvestedOn, createdBy: actor,
        },
      });
      const harvest = await tx.fodderHarvest.create({
        data: {
          id: harvestId, cropId, harvestedOn, form: input.form,
          qtyKg: input.qtyKg, dryMatterPct: input.dryMatterPct,
          itemId: item.id, batchId: batch.id, notes: input.notes, createdBy: actor,
        },
      });
      await this.audit.log('create', 'FodderHarvest', harvestId, null, {
        crop: crop.cropName, plot: crop.plot.name, kg: input.qtyKg, form: input.form, item: item.name,
      }, tx);
      return { ...harvest, batchNo: batch.batchNo, itemName: item.name };
    });
  }

  async getCrop(id: string) {
    const crop = await this.prisma.fodderCrop.findUnique({
      where: { id },
      include: { plot: true, harvests: { orderBy: { harvestedOn: 'asc' } } },
    });
    if (!crop) throw AppError.notFound('crop');
    const totalYieldKg = crop.harvests.reduce((n, h) => n + Number(h.qtyKg), 0);
    return {
      ...crop,
      totalYieldKg,
      yieldPerDecimal: crop.plot.areaDecimal && Number(crop.plot.areaDecimal) > 0
        ? Math.round((totalYieldKg / Number(crop.plot.areaDecimal)) * 10) / 10
        : null,
    };
  }
}
