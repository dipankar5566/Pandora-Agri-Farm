import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  CancelPurchaseBillInput, CreatePurchaseBillInput, RecordPurchasePaymentInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { PurchasesService } from './purchases.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get('purchase-bills')
  @Perm('purchases', 'view')
  async bills(@Query('supplierId') supplierId?: string, @Query('unpaid') unpaid?: string) {
    return { data: await this.purchases.listBills({ supplierId, unpaidOnly: unpaid === 'true' }) };
  }

  @Post('purchase-bills')
  @Perm('purchases', 'edit')
  async createBill(@Body(new ZodPipe(CreatePurchaseBillInput)) body: CreatePurchaseBillInput, @Req() req: AuthedReq) {
    return { data: await this.purchases.createBill(body, req.user.id) };
  }

  @Get('purchase-bills/:id')
  @Perm('purchases', 'view')
  async bill(@Param('id') id: string) {
    return { data: await this.purchases.getBill(id) };
  }

  @Post('purchase-bills/:id/cancel')
  @Perm('purchases', 'approve')
  async cancel(@Param('id') id: string, @Body(new ZodPipe(CancelPurchaseBillInput)) body: CancelPurchaseBillInput, @Req() req: AuthedReq) {
    return { data: await this.purchases.cancelBill(id, body, req.user.id) };
  }

  @Post('purchase-payments')
  @Perm('purchases', 'edit')
  async payment(@Body(new ZodPipe(RecordPurchasePaymentInput)) body: RecordPurchasePaymentInput, @Req() req: AuthedReq) {
    return { data: await this.purchases.recordPayment(body, req.user.id) };
  }

  @Get('purchases/outstanding')
  @Perm('purchases', 'view')
  async outstanding() {
    return { data: await this.purchases.supplierOutstanding() };
  }
}
