import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ulid } from 'ulid';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  /** Compress (max 1200px, JPEG q80 — Phase 2 §3.7 disk budget), dedupe by hash, link to animal. */
  async attachAnimalPhoto(animalId: string, file: Express.Multer.File | undefined, actor: string) {
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'errors.file_required');
    if (!file.mimetype.startsWith('image/')) throw new AppError(400, 'NOT_AN_IMAGE', 'errors.not_an_image');
    const animal = await this.prisma.animal.findFirst({ where: { id: animalId, deletedAt: null } });
    if (!animal) throw AppError.notFound('animal');

    const jpeg = await sharp(file.buffer)
      .rotate() // honor EXIF orientation from phone cameras
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const contentHash = createHash('sha256').update(jpeg).digest('hex');
    const fileName = `${contentHash}.jpg`;

    let attachment = await this.prisma.attachment.findFirst({ where: { contentHash, entityId: animalId } });
    if (!attachment) {
      await writeFile(join(UPLOAD_DIR, fileName), jpeg);
      attachment = await this.prisma.$transaction(async (tx) => {
        const att = await tx.attachment.create({
          data: {
            id: ulid(), entityType: 'Animal', entityId: animalId, kind: 'photo',
            filePath: fileName, contentHash, mime: 'image/jpeg', sizeBytes: jpeg.length, createdBy: actor,
          },
        });
        await tx.animal.update({ where: { id: animalId }, data: { photoAttachmentId: att.id } });
        await tx.animalEvent.create({
          data: {
            id: ulid(), animalId, eventType: 'photo_added', occurredAt: new Date(),
            summaryCode: 'timeline.photo_added', summaryParams: {}, refType: 'attachment', refId: att.id,
          },
        });
        await this.audit.log('create', 'Attachment', att.id, null, { animalId, sizeBytes: jpeg.length }, tx);
        return att;
      });
    }
    return attachment;
  }

  async open(id: string) {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) throw AppError.notFound('attachment');
    return { stream: createReadStream(join(UPLOAD_DIR, att.filePath)), mime: att.mime };
  }
}
