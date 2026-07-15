import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  AdjustStockInput, CreateItemInput, CreateSupplierInput, StockInInput,
  UpdateItemInput, UpdateSupplierInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { InventoryService } from './inventory.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  @Get('items')
  @Perm('inventory', 'view')
  async items(@Query('type') type?: string, @Query('belowMin') belowMin?: string, @Query('q') q?: string) {
    return { data: await this.inv.listItems({ type, belowMin: belowMin === 'true', q }) };
  }

  @Post('items')
  @Perm('inventory', 'edit')
  async createItem(@Body(new ZodPipe(CreateItemInput)) body: CreateItemInput, @Req() req: AuthedReq) {
    return { data: await this.inv.createItem(body, req.user.id) };
  }

  @Patch('items/:id')
  @Perm('inventory', 'edit')
  async updateItem(@Param('id') id: string, @Body(new ZodPipe(UpdateItemInput)) body: UpdateItemInput, @Req() req: AuthedReq) {
    return { data: await this.inv.updateItem(id, body, req.user.id) };
  }

  @Post('items/:id/batches')
  @Perm('inventory', 'edit')
  async stockIn(@Param('id') id: string, @Body(new ZodPipe(StockInInput)) body: StockInInput, @Req() req: AuthedReq) {
    return { data: await this.inv.stockIn(id, body, req.user.id) };
  }

  @Get('items/:id/batches')
  @Perm('inventory', 'view')
  async batches(@Param('id') id: string, @Query('all') all?: string) {
    return { data: await this.inv.batches(id, all !== 'true') };
  }

  @Get('items/:id/movements')
  @Perm('inventory', 'view')
  async movements(@Param('id') id: string) {
    return { data: await this.inv.movements(id) };
  }

  @Post('items/:id/adjust')
  @Perm('inventory', 'edit')
  async adjust(@Param('id') id: string, @Body(new ZodPipe(AdjustStockInput)) body: AdjustStockInput, @Req() req: AuthedReq) {
    return { data: await this.inv.adjust(id, body, req.user.id) };
  }

  @Get('stock/expiring')
  @Perm('inventory', 'view')
  async expiring(@Query('days') days?: string) {
    return { data: await this.inv.expiring(days ? Number(days) : 30) };
  }

  @Get('suppliers')
  @Perm('inventory', 'view')
  async suppliers() {
    return { data: await this.inv.listSuppliers() };
  }

  @Post('suppliers')
  @Perm('inventory', 'edit')
  async createSupplier(@Body(new ZodPipe(CreateSupplierInput)) body: CreateSupplierInput, @Req() req: AuthedReq) {
    return { data: await this.inv.createSupplier(body, req.user.id) };
  }

  @Patch('suppliers/:id')
  @Perm('inventory', 'edit')
  async updateSupplier(@Param('id') id: string, @Body(new ZodPipe(UpdateSupplierInput)) body: UpdateSupplierInput, @Req() req: AuthedReq) {
    return { data: await this.inv.updateSupplier(id, body, req.user.id) };
  }
}
