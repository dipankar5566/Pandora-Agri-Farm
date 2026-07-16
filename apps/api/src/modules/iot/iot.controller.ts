import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RegisterDeviceInput, SensorReadingBatchInput } from '@pandora/contracts';
import { Perm, Public, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { IotService } from './iot.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class IotController {
  constructor(private readonly iot: IotService) {}

  @Get('iot/devices')
  @Perm('iot', 'view')
  async devices() {
    return { data: await this.iot.listDevices() };
  }

  @Post('iot/devices')
  @Perm('iot', 'edit')
  async registerDevice(@Body(new ZodPipe(RegisterDeviceInput)) body: RegisterDeviceInput, @Req() req: AuthedReq) {
    return { data: await this.iot.registerDevice(body, req.user.id) };
  }

  @Get('iot/devices/:id/readings')
  @Perm('iot', 'view')
  async readings(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return { data: await this.iot.listReadings(id, from, to) };
  }

  /** Pilot gateways/readers post here — device API key, no session (same
   *  pattern as the ops-token scheduled-digest endpoint in
   *  notifications.controller.ts). */
  @Public()
  @Post('iot/readings')
  async ingest(
    @Headers('x-device-key') key: string | undefined,
    @Body(new ZodPipe(SensorReadingBatchInput)) body: SensorReadingBatchInput,
  ) {
    return { data: await this.iot.ingestReadings(key, body) };
  }
}
