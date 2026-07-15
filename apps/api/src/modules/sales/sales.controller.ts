import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  CancelInvoiceInput, CreateCustomerInput, CreateInvoiceInput,
  RecordSalePaymentInput, UpdateCustomerInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { SalesService } from './sales.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('customers')
  @Perm('sales', 'view')
  async customers() {
    return { data: await this.sales.listCustomers() };
  }

  @Post('customers')
  @Perm('sales', 'edit')
  async createCustomer(@Body(new ZodPipe(CreateCustomerInput)) body: CreateCustomerInput, @Req() req: AuthedReq) {
    return { data: await this.sales.createCustomer(body, req.user.id) };
  }

  @Patch('customers/:id')
  @Perm('sales', 'edit')
  async updateCustomer(@Param('id') id: string, @Body(new ZodPipe(UpdateCustomerInput)) body: UpdateCustomerInput, @Req() req: AuthedReq) {
    return { data: await this.sales.updateCustomer(id, body, req.user.id) };
  }

  @Get('sale-invoices')
  @Perm('sales', 'view')
  async invoices(@Query('customerId') customerId?: string, @Query('unpaid') unpaid?: string) {
    return { data: await this.sales.listInvoices({ customerId, unpaidOnly: unpaid === 'true' }) };
  }

  @Post('sale-invoices')
  @Perm('sales', 'edit')
  async createInvoice(@Body(new ZodPipe(CreateInvoiceInput)) body: CreateInvoiceInput, @Req() req: AuthedReq) {
    return { data: await this.sales.createInvoice(body, req.user.id) };
  }

  @Get('sale-invoices/:id')
  @Perm('sales', 'view')
  async invoice(@Param('id') id: string) {
    return { data: await this.sales.getInvoice(id) };
  }

  @Post('sale-invoices/:id/cancel')
  @Perm('sales', 'approve')
  async cancel(@Param('id') id: string, @Body(new ZodPipe(CancelInvoiceInput)) body: CancelInvoiceInput, @Req() req: AuthedReq) {
    return { data: await this.sales.cancelInvoice(id, body, req.user.id) };
  }

  @Post('sale-payments')
  @Perm('sales', 'edit')
  async payment(@Body(new ZodPipe(RecordSalePaymentInput)) body: RecordSalePaymentInput, @Req() req: AuthedReq) {
    return { data: await this.sales.recordPayment(body, req.user.id) };
  }
}
