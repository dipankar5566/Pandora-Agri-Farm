import { z } from 'zod';

// ── shared primitives ────────────────────────────────────────────────
export const Phone = z.string().regex(/^[6-9]\d{9}$/, 'errors.phone_invalid');
export const Locale = z.enum(['en', 'bn']);
export const Theme = z.enum(['light', 'dark']);
export const PermLevel = z.enum(['none', 'view', 'edit', 'approve']);
export const PERM_ORDER = { none: 0, view: 1, edit: 2, approve: 3 } as const;

export const MODULES = [
  'dashboard', 'livestock', 'breeding', 'health', 'inventory',
  'feed', 'finance', 'sales', 'purchases', 'tasks', 'settings',
] as const;
export const Module = z.enum(MODULES);
export type ModuleName = (typeof MODULES)[number];

// ── auth ─────────────────────────────────────────────────────────────
export const LoginInput = z.object({
  phone: Phone,
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const UpdateMeInput = z
  .object({
    locale: Locale.optional(),
    theme: Theme.optional(),
    currentPassword: z.string().min(8).max(128).optional(),
    newPassword: z.string().min(8).max(128).optional(),
  })
  .refine((v) => !v.newPassword || v.currentPassword, {
    message: 'errors.current_password_required',
    path: ['currentPassword'],
  });
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

// ── users & roles ────────────────────────────────────────────────────
export const CreateUserInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: Phone,
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
  locale: Locale.default('bn'),
  roleIds: z.array(z.string().length(26)).min(1),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = CreateUserInput.partial().omit({ password: true }).extend({
  newPassword: z.string().min(8).max(128).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

export const PatchPermissionsInput = z.object({
  permissions: z.array(z.object({ module: Module, level: PermLevel })).min(1),
});
export type PatchPermissionsInput = z.infer<typeof PatchPermissionsInput>;

// ── farm & settings ──────────────────────────────────────────────────
export const UpdateFarmInput = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  address: z.string().max(500).optional(),
  district: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
  tagPrefix: z.string().regex(/^[A-Z]{2,6}$/).optional(),
  defaultLocale: Locale.optional(),
});
export type UpdateFarmInput = z.infer<typeof UpdateFarmInput>;

export const SettingValue = z.object({ value: z.unknown() });
export * from './herd';
export * from './breeding';
export * from './inventory';
export * from './health';
export * from './ops';
export * from './search';
export * from './sales';
export * from './purchases';
