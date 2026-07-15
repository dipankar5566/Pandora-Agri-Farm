import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  RecordAbortionInput, RecordDiagnosisInput, RecordHeatInput,
  RecordKiddingInput, RecordServiceInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { BreedingService } from './breeding.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class BreedingController {
  constructor(private readonly breeding: BreedingService) {}

  @Post('heats')
  @Perm('breeding', 'edit')
  async recordHeat(@Body(new ZodPipe(RecordHeatInput)) body: RecordHeatInput, @Req() req: AuthedReq) {
    return { data: await this.breeding.recordHeat(body, req.user.id) };
  }

  @Get('heats')
  @Perm('breeding', 'view')
  async listHeats(@Query('days') days?: string) {
    return { data: await this.breeding.listHeats(days ? Number(days) : 30) };
  }

  @Post('services')
  @Perm('breeding', 'edit')
  async recordService(@Body(new ZodPipe(RecordServiceInput)) body: RecordServiceInput, @Req() req: AuthedReq) {
    return { data: await this.breeding.recordService(body, req.user.id) };
  }

  @Post('services/:id/diagnoses')
  @Perm('breeding', 'edit')
  async recordDiagnosis(
    @Param('id') id: string,
    @Body(new ZodPipe(RecordDiagnosisInput)) body: RecordDiagnosisInput,
    @Req() req: AuthedReq,
  ) {
    return { data: await this.breeding.recordDiagnosis(id, body, req.user.id) };
  }

  @Get('pregnancies')
  @Perm('breeding', 'view')
  async pregnancies(@Query('status') status?: string, @Query('dueWithin') dueWithin?: string) {
    return { data: await this.breeding.listPregnancies(status ?? 'ongoing', dueWithin ? Number(dueWithin) : undefined) };
  }

  @Post('pregnancies/:id/kidding')
  @Perm('breeding', 'edit')
  async recordKidding(
    @Param('id') id: string,
    @Body(new ZodPipe(RecordKiddingInput)) body: RecordKiddingInput,
    @Req() req: AuthedReq,
  ) {
    return { data: await this.breeding.recordKidding(id, body, req.user.id) };
  }

  @Post('pregnancies/:id/abortion')
  @Perm('breeding', 'edit')
  async recordAbortion(
    @Param('id') id: string,
    @Body(new ZodPipe(RecordAbortionInput)) body: RecordAbortionInput,
    @Req() req: AuthedReq,
  ) {
    return { data: await this.breeding.recordAbortion(id, body, req.user.id) };
  }

  @Get('breeding/performance')
  @Perm('breeding', 'view')
  async performance(@Query('by') by?: string) {
    return { data: await this.breeding.performance(by === 'buck' ? 'buck' : 'doe') };
  }
}
