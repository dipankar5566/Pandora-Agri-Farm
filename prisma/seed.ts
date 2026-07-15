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

  // Breeds (Phase 3 §4.1 — Black Bengal defaults tuned for Birbhum).
  const BREEDS: Array<[string, string, number, number | null, number | null]> = [
    // name, name_bn, gestation, adult wt kg, puberty days
    ['Black Bengal', 'ব্ল্যাক বেঙ্গল', 148, 25, 210],
    ['Sirohi', 'সিরোহি', 150, 40, 270],
    ['Jamunapari', 'যমুনাপারি', 150, 60, 300],
    ['Barbari', 'বারবারি', 148, 35, 240],
    ['Beetal', 'বিটল', 150, 55, 285],
    ['Osmanabadi', 'ওসমানাবাদি', 150, 32, 240],
    ['Boer', 'বোয়ার', 150, 90, 240],
    ['Boer Cross', 'বোয়ার ক্রস', 150, 55, 240],
    ['Local / Nondescript', 'দেশি', 150, 28, 240],
  ];
  for (const [name, nameBn, gestationDays, adultWeightKg, pubertyAgeDays] of BREEDS) {
    await prisma.breed.upsert({
      where: { name },
      create: { id: ulid(), name, nameBn, gestationDays, adultWeightKg, pubertyAgeDays },
      update: {},
    });
  }
  console.log('✓ breeds');

  // One default shed with starter pens so registration works out of the box.
  let shed = await prisma.shed.findFirst();
  if (!shed) {
    shed = await prisma.shed.create({ data: { id: ulid(), name: 'Main Shed', nameBn: 'মূল শেড' } });
    const pens: Array<[string, 'general' | 'kidding' | 'buck' | 'kid' | 'isolation']> = [
      ['A', 'general'], ['B', 'general'], ['Buck', 'buck'],
      ['Kidding', 'kidding'], ['Kids', 'kid'], ['Isolation', 'isolation'],
    ];
    for (const [name, purpose] of pens) {
      await prisma.pen.create({ data: { id: ulid(), shedId: shed.id, name, purpose } });
    }
    console.log('✓ default shed & pens');
  }

  await prisma.setting.upsert({
    where: { key: 'tag.next' },
    create: { key: 'tag.next', value: 1 },
    update: {},
  });

  // Health protocols — Phase 1 §5.3 India-standard schedule, farm-editable.
  const PROTOCOLS: Array<{
    name: string; nameBn: string; type: 'vaccination' | 'deworming';
    firstDoseAgeDays: number; boosterAfterDays?: number; repeatIntervalDays: number;
    dosePerKg?: number; doseFixed?: number; doseUnit?: string; appliesTo?: 'all' | 'kid' | 'adult';
  }> = [
    { name: 'PPR', nameBn: 'পিপিআর', type: 'vaccination', firstDoseAgeDays: 120, repeatIntervalDays: 1095, doseFixed: 1, doseUnit: 'dose' },
    { name: 'ET (Enterotoxaemia)', nameBn: 'ইটি', type: 'vaccination', firstDoseAgeDays: 120, boosterAfterDays: 21, repeatIntervalDays: 365, doseFixed: 1, doseUnit: 'dose' },
    { name: 'HS', nameBn: 'এইচএস', type: 'vaccination', firstDoseAgeDays: 180, repeatIntervalDays: 365, doseFixed: 1, doseUnit: 'dose' },
    { name: 'FMD', nameBn: 'এফএমডি', type: 'vaccination', firstDoseAgeDays: 120, repeatIntervalDays: 182, doseFixed: 1, doseUnit: 'dose' },
    { name: 'Goat Pox', nameBn: 'গোট পক্স', type: 'vaccination', firstDoseAgeDays: 90, repeatIntervalDays: 365, doseFixed: 1, doseUnit: 'dose' },
    { name: 'Deworming (quarterly)', nameBn: 'কৃমিনাশক (ত্রৈমাসিক)', type: 'deworming', firstDoseAgeDays: 60, repeatIntervalDays: 90, dosePerKg: 0.2, doseUnit: 'ml' },
  ];
  for (const p of PROTOCOLS) {
    await prisma.healthProtocol.upsert({
      where: { name: p.name },
      create: { id: ulid(), ...p },
      update: {}, // never overwrite farm edits
    });
  }
  console.log('✓ health protocols');

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
