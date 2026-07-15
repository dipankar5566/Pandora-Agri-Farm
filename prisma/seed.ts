/* Idempotent seed: farm profile, 9 system roles + RBAC matrix, owner user.
 * Run: npm run seed   (owner credentials from SEED_OWNER_PHONE / SEED_OWNER_PASSWORD) */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

const MODULES = [
  'dashboard', 'livestock', 'breeding', 'health', 'inventory',
  'feed', 'finance', 'tasks', 'settings',
] as const;
type Mod = (typeof MODULES)[number];
type Level = 'none' | 'view' | 'edit' | 'approve';

// Phase 1 §3 role matrix (R1 modules). Owner = approve everything, immutable.
const MATRIX: Record<string, Partial<Record<Mod, Level>>> = {
  owner: Object.fromEntries(MODULES.map((m) => [m, 'approve'])),
  farm_manager: {
    dashboard: 'view', livestock: 'approve', breeding: 'approve', health: 'approve',
    inventory: 'approve', feed: 'approve', tasks: 'approve', finance: 'edit', settings: 'view',
  },
  veterinarian: {
    dashboard: 'view', livestock: 'view', breeding: 'edit', health: 'approve',
    inventory: 'view', tasks: 'edit',
  },
  supervisor: {
    dashboard: 'view', livestock: 'edit', breeding: 'edit', health: 'edit',
    inventory: 'edit', feed: 'edit', tasks: 'edit',
  },
  worker: { dashboard: 'view', livestock: 'view', feed: 'edit', tasks: 'edit' },
  sales: { dashboard: 'view', livestock: 'view', finance: 'edit', tasks: 'view' },
  purchase_manager: { dashboard: 'view', inventory: 'approve', finance: 'edit' },
  accountant: { dashboard: 'view', finance: 'edit' },
  visitor: { dashboard: 'view' },
};

async function main(): Promise<void> {
  const farm = await prisma.farm.findFirst();
  if (!farm) {
    await prisma.farm.create({
      data: {
        id: ulid(),
        name: 'Pandora Goat Farm',
        district: 'Birbhum',
        state: 'West Bengal',
        plotDetails: {
          mouza: 'Tantipara', jlNo: '51', plotNo: '2308', ps: 'Raj Nagar',
          blocks: [{ name: 'A', areaDecimal: 133 }, { name: 'B', areaDecimal: 133 }],
        },
      },
    });
    console.log('✓ farm created');
  }

  for (const [name, perms] of Object.entries(MATRIX)) {
    const role = await prisma.role.upsert({
      where: { name },
      create: { id: ulid(), name, isSystem: true },
      update: {},
    });
    for (const [module, level] of Object.entries(perms)) {
      await prisma.rolePermission.upsert({
        where: { roleId_module: { roleId: role.id, module } },
        create: { roleId: role.id, module, level: level as Level },
        update: {}, // seed never overwrites farm-edited permissions
      });
    }
  }
  console.log('✓ roles & permissions');

  const ownerPhone = process.env.SEED_OWNER_PHONE ?? '9999999999';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const existing = await prisma.user.findFirst({ where: { phone: ownerPhone } });
  if (!existing) {
    if (!ownerPassword) throw new Error('Set SEED_OWNER_PASSWORD to create the owner user');
    const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'owner' } });
    await prisma.user.create({
      data: {
        id: ulid(),
        fullName: 'Owner',
        phone: ownerPhone,
        locale: 'en',
        passwordHash: await argon2.hash(ownerPassword, { type: argon2.argon2id }),
        roles: { create: [{ roleId: ownerRole.id }] },
      },
    });
    console.log(`✓ owner user (${ownerPhone}) — change the password after first login`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
