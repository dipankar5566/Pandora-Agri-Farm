import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  CloseCropInput, CreatePlotInput, RecordHarvestInput, SowCropInput, UpdatePlotInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { FodderService } from './fodder.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class FodderController {
  constructor(private readonly fodder: FodderService) {}

  @Get('fodder-plots')
  @Perm('feed', 'view')
  async plots() {
    return { data: await this.fodder.listPlots() };
  }

  @Post('fodder-plots')
  @Perm('feed', 'approve')
  async createPlot(@Body(new ZodPipe(CreatePlotInput)) body: CreatePlotInput, @Req() req: AuthedReq) {
    return { data: await this.fodder.createPlot(body, req.user.id) };
  }

  @Patch('fodder-plots/:id')
  @Perm('feed', 'approve')
  async updatePlot(@Param('id') id: string, @Body(new ZodPipe(UpdatePlotInput)) body: UpdatePlotInput, @Req() req: AuthedReq) {
    return { data: await this.fodder.updatePlot(id, body, req.user.id) };
  }

  @Get('fodder-crops')
  @Perm('feed', 'view')
  async crops(@Query('status') status?: string) {
    return { data: await this.fodder.listCrops(status) };
  }

  @Post('fodder-crops')
  @Perm('feed', 'edit')
  async sow(@Body(new ZodPipe(SowCropInput)) body: SowCropInput, @Req() req: AuthedReq) {
    return { data: await this.fodder.sowCrop(body, req.user.id) };
  }

  @Get('fodder-crops/:id')
  @Perm('feed', 'view')
  async crop(@Param('id') id: string) {
    return { data: await this.fodder.getCrop(id) };
  }

  @Patch('fodder-crops/:id')
  @Perm('feed', 'edit')
  async close(@Param('id') id: string, @Body(new ZodPipe(CloseCropInput)) body: CloseCropInput, @Req() req: AuthedReq) {
    return { data: await this.fodder.closeCrop(id, body, req.user.id) };
  }

  @Post('fodder-crops/:id/harvests')
  @Perm('feed', 'edit')
  async harvest(@Param('id') id: string, @Body(new ZodPipe(RecordHarvestInput)) body: RecordHarvestInput, @Req() req: AuthedReq) {
    return { data: await this.fodder.recordHarvest(id, body, req.user.id) };
  }
}
