import { z } from 'zod';
import { DateOnly, Ulid } from './herd';

export const CreateEmployeeInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  designation: z.string().trim().max(80).optional(),
  wageType: z.enum(['monthly', 'daily']),
  wageRate: z.coerce.number().positive().max(1000000),
  joinedOn: DateOnly,
  notes: z.string().max(500).optional(),
});
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInput>;

export const UpdateEmployeeInput = CreateEmployeeInput.partial().extend({
  leftOn: DateOnly.nullable().optional(),
});
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeInput>;

export const MarkAttendanceInput = z.object({
  date: DateOnly,
  entries: z.array(z.object({
    employeeId: Ulid,
    status: z.enum(['present', 'absent', 'half_day', 'leave']),
    notes: z.string().max(200).optional(),
  })).min(1).max(100),
});
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceInput>;

const Month = z.string().regex(/^\d{4}-\d{2}$/, 'errors.month_invalid');

export const PayrollPreviewInput = z.object({
  employeeId: Ulid,
  month: Month,
});
export type PayrollPreviewInput = z.infer<typeof PayrollPreviewInput>;

export const CreatePayrollRunInput = z.object({
  employeeId: Ulid,
  month: Month,
  bonus: z.coerce.number().min(0).default(0),
  deductions: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).optional(),
});
export type CreatePayrollRunInput = z.infer<typeof CreatePayrollRunInput>;

export const PayPayrollInput = z.object({
  paidOn: DateOnly,
  method: z.enum(['cash', 'bank', 'upi', 'cheque']).default('cash'),
});
export type PayPayrollInput = z.infer<typeof PayPayrollInput>;
