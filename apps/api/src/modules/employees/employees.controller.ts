import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  CreateEmployeeInput, CreatePayrollRunInput, MarkAttendanceInput,
  PayPayrollInput, PayrollPreviewInput, UpdateEmployeeInput,
} from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { EmployeesService } from './employees.service';

type AuthedReq = Request & { user: SessionUser };

@Controller()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('employees')
  @Perm('employees', 'view')
  async list() {
    return { data: await this.employees.list() };
  }

  @Post('employees')
  @Perm('employees', 'approve')
  async create(@Body(new ZodPipe(CreateEmployeeInput)) body: CreateEmployeeInput, @Req() req: AuthedReq) {
    return { data: await this.employees.create(body, req.user.id) };
  }

  @Patch('employees/:id')
  @Perm('employees', 'approve')
  async update(@Param('id') id: string, @Body(new ZodPipe(UpdateEmployeeInput)) body: UpdateEmployeeInput, @Req() req: AuthedReq) {
    return { data: await this.employees.update(id, body, req.user.id) };
  }

  @Post('attendance')
  @Perm('employees', 'edit')
  async markDay(@Body(new ZodPipe(MarkAttendanceInput)) body: MarkAttendanceInput, @Req() req: AuthedReq) {
    return { data: await this.employees.markDay(body, req.user.id) };
  }

  @Get('attendance')
  @Perm('employees', 'view')
  async month(@Query('month') month?: string) {
    return { data: await this.employees.monthAttendance(month ?? new Date().toISOString().slice(0, 7)) };
  }

  @Post('payroll/preview')
  @Perm('employees', 'approve')
  async preview(@Body(new ZodPipe(PayrollPreviewInput)) body: PayrollPreviewInput) {
    return { data: await this.employees.preview(body.employeeId, body.month) };
  }

  @Get('payroll')
  @Perm('employees', 'view')
  async runs(@Query('month') month?: string) {
    return { data: await this.employees.listRuns(month) };
  }

  @Post('payroll')
  @Perm('employees', 'approve')
  async createRun(@Body(new ZodPipe(CreatePayrollRunInput)) body: CreatePayrollRunInput, @Req() req: AuthedReq) {
    return { data: await this.employees.createRun(body, req.user.id) };
  }

  @Post('payroll/:id/pay')
  @Perm('employees', 'approve')
  async pay(@Param('id') id: string, @Body(new ZodPipe(PayPayrollInput)) body: PayPayrollInput, @Req() req: AuthedReq) {
    return { data: await this.employees.pay(id, body, req.user.id) };
  }
}
