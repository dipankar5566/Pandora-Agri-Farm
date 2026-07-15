import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import * as QRCode from 'qrcode';
import {
  BatchWeighInput, BulkIntakeInput, CreateAnimalInput, CreatePenInput, CreateShedInput,
  ExitAnimalInput, ListAnimalsQuery, MoveAnimalInput, UpdateAnimalInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { FilesService } from './files.service';
import { HerdService } from './herd.service';
import { LookupsService } from './lookups.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class HerdController {
  constructor(
    private readonly herd: HerdService,
    private readonly files: FilesService,
    private readonly lookups: LookupsService,
  ) {}

  // ── animals ────────────────────────────────────────────────────────
  @Get('animals')
  @Perm('livestock', 'view')
  async list(@Query(new ZodPipe(ListAnimalsQuery)) q: ListAnimalsQuery) {
    return this.herd.list(q);
  }

  @Get('herd/stats')
  @Perm('dashboard', 'view')
  async stats() {
    return { data: await this.herd.stats() };
  }

  @Post('animals')
  @Perm('livestock', 'edit')
  async create(@Body(new ZodPipe(CreateAnimalInput)) body: CreateAnimalInput, @Req() req: AuthedReq) {
    return { data: await this.herd.create(body, req.user.id) };
  }

  @Post('animals/bulk-intake')
  @Perm('livestock', 'edit')
  async bulkIntake(@Body(new ZodPipe(BulkIntakeInput)) body: BulkIntakeInput, @Req() req: AuthedReq) {
    return { data: await this.herd.bulkIntake(body, req.user.id) };
  }

  @Get('animals/:id')
  @Perm('livestock', 'view')
  async get(@Param('id') id: string) {
    return { data: await this.herd.get(id) };
  }

  @Patch('animals/:id')
  @Perm('livestock', 'edit')
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateAnimalInput)) body: UpdateAnimalInput,
    @Req() req: AuthedReq,
  ) {
    return { data: await this.herd.update(id, body, req.user.id) };
  }

  @Get('animals/:id/timeline')
  @Perm('livestock', 'view')
  async timeline(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.herd.timeline(id, cursor);
  }

  @Get('animals/:id/weights')
  @Perm('livestock', 'view')
  async weights(@Param('id') id: string) {
    return { data: await this.herd.weights(id) };
  }

  @Post('animals/:id/move')
  @Perm('livestock', 'edit')
  async move(
    @Param('id') id: string,
    @Body(new ZodPipe(MoveAnimalInput)) body: MoveAnimalInput,
    @Req() req: AuthedReq,
  ) {
    return this.herd.move(id, body, req.user.id);
  }

  @Post('animals/:id/exit')
  @Perm('livestock', 'edit')
  async exit(
    @Param('id') id: string,
    @Body(new ZodPipe(ExitAnimalInput)) body: ExitAnimalInput,
    @Req() req: AuthedReq,
  ) {
    return { data: await this.herd.exit(id, body, req.user.id) };
  }

  @Post('weights')
  @Perm('livestock', 'edit')
  async batchWeigh(@Body(new ZodPipe(BatchWeighInput)) body: BatchWeighInput, @Req() req: AuthedReq) {
    return { data: await this.herd.batchWeigh(body, req.user.id) };
  }

  // ── photo & QR ─────────────────────────────────────────────────────
  @Post('animals/:id/photos')
  @Perm('livestock', 'edit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async photo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: AuthedReq) {
    return { data: await this.files.attachAnimalPhoto(id, file, req.user.id) };
  }

  @Get('attachments/:id')
  @Perm('livestock', 'view')
  async attachment(@Param('id') id: string, @Res() res: Response) {
    const { stream, mime } = await this.files.open(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    stream.pipe(res);
  }

  @Get('animals/:id/qr')
  @Perm('livestock', 'view')
  async qr(@Param('id') id: string, @Res() res: Response) {
    const animal = await this.herd.get(id);
    const png = await QRCode.toBuffer(`pandora://animal/${animal.id}`, { width: 400, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${animal.tagNumber}-qr.png"`);
    res.send(png);
  }

  // ── lookups ────────────────────────────────────────────────────────
  @Get('breeds')
  @Perm('livestock', 'view')
  async breeds() {
    return { data: await this.lookups.breeds() };
  }

  @Get('pens')
  @Perm('livestock', 'view')
  async pens() {
    return { data: await this.lookups.pens() };
  }

  @Post('pens')
  @Perm('livestock', 'approve')
  async createPen(@Body(new ZodPipe(CreatePenInput)) body: typeof CreatePenInput._type, @Req() req: AuthedReq) {
    return { data: await this.lookups.createPen(body, req.user.id) };
  }

  @Get('sheds')
  @Perm('livestock', 'view')
  async sheds() {
    return { data: await this.lookups.sheds() };
  }

  @Post('sheds')
  @Perm('livestock', 'approve')
  async createShed(@Body(new ZodPipe(CreateShedInput)) body: typeof CreateShedInput._type, @Req() req: AuthedReq) {
    return { data: await this.lookups.createShed(body, req.user.id) };
  }
}
