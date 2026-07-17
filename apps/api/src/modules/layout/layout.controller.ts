import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import {
  CreateFeatureInput, ReplacePlanInput, SetAnchorsInput, UpdateFeatureInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { AppError } from '../../common/errors';
import { FilesService } from '../herd/files.service';
import { LayoutService } from './layout.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class LayoutController {
  constructor(
    private readonly layout: LayoutService,
    private readonly files: FilesService,
  ) {}

  @Get('site-layout')
  @Perm('layout', 'view')
  async get() {
    return { data: await this.layout.get() };
  }

  /** Served here under the layout perm, not via /attachments (livestock perm). */
  @Get('site-layout/plan')
  @Perm('layout', 'view')
  async plan(@Res() res: Response) {
    const planAttachmentId = await this.layout.planAttachmentId();
    if (!planAttachmentId) throw AppError.notFound('plan');
    const { stream, mime } = await this.files.open(planAttachmentId);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    stream.pipe(res);
  }

  @Put('site-layout/plan')
  @Perm('layout', 'approve')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  async replacePlan(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodPipe(ReplacePlanInput)) body: ReplacePlanInput,
    @Req() req: AuthedReq,
  ) {
    return { data: await this.layout.replacePlan(file, body, req.user.id) };
  }

  @Put('site-layout/anchors')
  @Perm('layout', 'approve')
  async setAnchors(@Body(new ZodPipe(SetAnchorsInput)) body: SetAnchorsInput, @Req() req: AuthedReq) {
    return { data: await this.layout.setAnchors(body, req.user.id) };
  }

  @Post('site-features')
  @Perm('layout', 'edit')
  async create(@Body(new ZodPipe(CreateFeatureInput)) body: CreateFeatureInput, @Req() req: AuthedReq) {
    return { data: await this.layout.createFeature(body, req.user.id) };
  }

  @Patch('site-features/:id')
  @Perm('layout', 'edit')
  async update(@Param('id') id: string, @Body(new ZodPipe(UpdateFeatureInput)) body: UpdateFeatureInput, @Req() req: AuthedReq) {
    return { data: await this.layout.updateFeature(id, body, req.user.id) };
  }

  @Delete('site-features/:id')
  @Perm('layout', 'edit')
  async remove(@Param('id') id: string, @Req() req: AuthedReq) {
    return { data: await this.layout.deleteFeature(id, req.user.id) };
  }
}
