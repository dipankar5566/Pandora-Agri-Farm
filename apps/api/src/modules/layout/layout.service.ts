import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ulid } from 'ulid';
import type {
  CreateFeatureInput, ReplacePlanInput, SetAnchorsInput, UpdateFeatureInput,
} from '@pandora/contracts';
import { geometryIssue, type FeatureKind, type PointPx } from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');

/** Plot reads harvest_due this many days before expectedHarvestOn. A constant,
 *  not a setting, until someone asks (docs/layout/04 §2). */
const HARVEST_DUE_DAYS = 7;

// The plan carries text and thin lines that must survive tracing zoom —
// hence 4096, not the photo pipeline's 1200 (docs/layout/05 §3).
const PLAN_MAX_PX = 4096;

@Injectable()
export class LayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  private async layout() {
    const layout = await this.prisma.siteLayout.findFirst({ where: { deletedAt: null } });
    if (!layout) throw AppError.notFound('layout'); // seed owns creation
    return layout;
  }

  async planAttachmentId() {
    return (await this.layout()).planAttachmentId;
  }

  /** Layout + live features, each enriched from its linked record (docs/layout/04 §1). */
  async get() {
    const layout = await this.layout();
    const features = await this.prisma.siteFeature.findMany({
      where: { layoutId: layout.id, deletedAt: null },
      orderBy: [{ zIndex: 'asc' }, { createdAt: 'asc' }],
    });

    const idsOf = (t: string) => features.filter((f) => f.refType === t).map((f) => f.refId as string);
    const [plots, sheds, devices] = await Promise.all([
      this.prisma.fodderPlot.findMany({
        where: { id: { in: idsOf('fodder_plot') }, deletedAt: null },
        include: {
          crops: {
            where: { status: 'growing' },
            select: {
              id: true, cropName: true, variety: true, sownOn: true, expectedHarvestOn: true,
              harvests: { select: { qtyKg: true } },
            },
          },
        },
      }),
      this.prisma.shed.findMany({ where: { id: { in: idsOf('shed') } } }),
      this.prisma.iotDevice.findMany({ where: { id: { in: idsOf('iot_device') }, deletedAt: null } }),
    ]);
    const plotById = new Map(plots.map((p) => [p.id, p]));
    const shedById = new Map(sheds.map((s) => [s.id, s]));
    const deviceById = new Map(devices.map((d) => [d.id, d]));

    const now = Date.now();
    const dueBefore = now + HARVEST_DUE_DAYS * 86400000;
    const enriched = features.map((f) => {
      if (!f.refType) return f;
      if (f.refType === 'fodder_plot') {
        const plot = plotById.get(f.refId as string);
        if (!plot) return { ...f, linkBroken: true };
        const crop = plot.crops[0];
        const status = !crop ? 'fallow'
          : crop.expectedHarvestOn && crop.expectedHarvestOn.getTime() <= dueBefore ? 'harvest_due'
          : 'planted';
        return {
          ...f,
          status,
          plot: {
            name: plot.name, block: plot.block, areaDecimal: plot.areaDecimal,
            crop: crop ? {
              id: crop.id, cropName: crop.cropName, variety: crop.variety,
              sownOn: crop.sownOn, expectedHarvestOn: crop.expectedHarvestOn,
              ageDays: Math.floor((now - crop.sownOn.getTime()) / 86400000),
              cuts: crop.harvests.length,
              totalYieldKg: crop.harvests.reduce((n, h) => n + Number(h.qtyKg), 0),
            } : null,
          },
        };
      }
      if (f.refType === 'shed') {
        const shed = shedById.get(f.refId as string);
        return shed ? { ...f, shed: { name: shed.name, nameBn: shed.nameBn } } : { ...f, linkBroken: true };
      }
      const device = deviceById.get(f.refId as string);
      return device
        ? { ...f, device: { deviceType: device.deviceType, serialNumber: device.serialNumber, installLocation: device.installLocation } }
        : { ...f, linkBroken: true };
    });

    return { ...layout, features: enriched };
  }

  /** Resize (4096px cap), dedupe by hash, swap the layout's plan pointer.
   *  Different dimensions with features present = soft-rule override
   *  (docs/layout/02 §8): geometry is bound to the plan's pixel space. */
  async replacePlan(file: Express.Multer.File | undefined, input: ReplacePlanInput, actor: string) {
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'errors.file_required');
    if (!file.mimetype.startsWith('image/')) throw new AppError(400, 'NOT_AN_IMAGE', 'errors.not_an_image');
    const layout = await this.layout();

    const { data: jpeg, info } = await sharp(file.buffer)
      .rotate()
      .resize({ width: PLAN_MAX_PX, height: PLAN_MAX_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });

    const featureCount = await this.prisma.siteFeature.count({
      where: { layoutId: layout.id, deletedAt: null },
    });
    const anchorCount = (layout.anchors as unknown[]).length;
    const dimensionsChanged = layout.planWidth !== null
      && (info.width !== layout.planWidth || info.height !== layout.planHeight);
    if (dimensionsChanged && (featureCount > 0 || anchorCount > 0) && !input.confirmOverride) {
      throw new AppError(422, 'RULE_OVERRIDE_REQUIRED', 'errors.rule_override_required', {
        warnings: ['PLAN_DIMENSIONS_CHANGED'], featureCount, anchorCount,
      });
    }

    const contentHash = createHash('sha256').update(jpeg).digest('hex');
    const fileName = `${contentHash}.jpg`;
    let attachment = await this.prisma.attachment.findFirst({
      where: { contentHash, entityId: layout.id },
    });
    if (!attachment) {
      await writeFile(join(UPLOAD_DIR, fileName), jpeg);
      attachment = await this.prisma.attachment.create({
        data: {
          id: ulid(), entityType: 'SiteLayout', entityId: layout.id, kind: 'siteplan',
          filePath: fileName, contentHash, mime: 'image/jpeg', sizeBytes: jpeg.length, createdBy: actor,
        },
      });
    }

    const before = { planAttachmentId: layout.planAttachmentId, planWidth: layout.planWidth, planHeight: layout.planHeight };
    const after = { planAttachmentId: attachment.id, planWidth: info.width, planHeight: info.height };
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.siteLayout.update({
        where: { id: layout.id },
        data: { ...after, updatedBy: actor },
      });
      await this.audit.log('update', 'SiteLayout', layout.id, before, {
        ...after, ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
      }, tx);
      await this.audit.version('SiteLayout', layout.id, row, tx);
      return row;
    });
    return {
      ...updated,
      ...(dimensionsChanged ? { warnings: ['PLAN_DIMENSIONS_CHANGED'] } : {}),
    };
  }

  async setAnchors(input: SetAnchorsInput, actor: string) {
    const layout = await this.layout();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.siteLayout.update({
        where: { id: layout.id },
        data: { anchors: input.anchors, updatedBy: actor },
      });
      await this.audit.log('update', 'SiteLayout', layout.id, { anchors: layout.anchors }, { anchors: input.anchors }, tx);
      await this.audit.version('SiteLayout', layout.id, row, tx);
      return row;
    });
  }

  private async assertRefExists(refType: string, refId: string) {
    const found =
      refType === 'fodder_plot' ? await this.prisma.fodderPlot.findFirst({ where: { id: refId, deletedAt: null } })
      : refType === 'shed' ? await this.prisma.shed.findFirst({ where: { id: refId } })
      : await this.prisma.iotDevice.findFirst({ where: { id: refId, deletedAt: null } });
    if (!found) throw new AppError(404, 'REF_NOT_FOUND', 'errors.ref_not_found', { refType });
  }

  private static refConflict(e: unknown): never {
    if ((e as { code?: string })?.code === 'P2002') throw AppError.conflict('REF_ALREADY_MAPPED');
    throw e;
  }

  async createFeature(input: CreateFeatureInput, actor: string) {
    const layout = await this.layout();
    if (input.refType && input.refId) await this.assertRefExists(input.refType, input.refId);
    const feature = await this.prisma.$transaction(async (tx) => {
      const row = await tx.siteFeature.create({
        data: {
          id: ulid(), layoutId: layout.id, ...input,
          zIndex: input.zIndex ?? (input.kind === 'zone' ? -10 : 0), // zones tint beneath
          createdBy: actor,
        },
      });
      await this.audit.log('create', 'SiteFeature', row.id, null, input, tx);
      return row;
    }).catch(LayoutService.refConflict);
    return feature;
  }

  async updateFeature(id: string, input: UpdateFeatureInput, actor: string) {
    const before = await this.prisma.siteFeature.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('feature');

    // Kind-vs-geometry rules re-run against the stored row when only one side
    // changes (contracts can only check when both arrive together).
    const kind = (input.kind ?? before.kind) as FeatureKind;
    const geometry = (input.geometry ?? before.geometry) as PointPx[];
    const issue = geometryIssue(kind, geometry);
    if (issue) throw new AppError(400, 'GEOMETRY_INVALID', issue, undefined, 'geometry');

    if (input.refType && input.refId) await this.assertRefExists(input.refType, input.refId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.siteFeature.update({
        where: { id },
        data: { ...input, updatedBy: actor },
      });
      await this.audit.log('update', 'SiteFeature', id, before, input, tx);
      return row;
    }).catch(LayoutService.refConflict);
    return updated;
  }

  async deleteFeature(id: string, actor: string) {
    const before = await this.prisma.siteFeature.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('feature');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.siteFeature.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: actor },
      });
      await this.audit.log('soft_delete', 'SiteFeature', id, before, null, tx);
      return row;
    });
  }
}
