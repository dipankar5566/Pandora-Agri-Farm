import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';
import type { CreateUserInput, UpdateUserInput } from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

const PUBLIC_FIELDS = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  locale: true,
  isActive: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role) }));
  }

  async create(input: CreateUserInput, actorId: string) {
    const clash = await this.prisma.user.findFirst({ where: { phone: input.phone, deletedAt: null } });
    if (clash) throw AppError.conflict('PHONE_TAKEN');
    const roles = await this.prisma.role.findMany({ where: { id: { in: input.roleIds } } });
    if (roles.length !== input.roleIds.length) throw AppError.notFound('role');

    const id = ulid();
    const user = await this.prisma.user.create({
      data: {
        id,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        locale: input.locale,
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
        createdBy: actorId,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
      },
      select: PUBLIC_FIELDS,
    });
    await this.audit.log('create', 'User', id, null, { fullName: input.fullName, phone: input.phone, roleIds: input.roleIds });
    return { ...user, roles: user.roles.map((r) => r.role) };
  }

  async update(id: string, input: UpdateUserInput, actorId: string) {
    const before = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: true },
    });
    if (!before) throw AppError.notFound('user');
    if (input.phone && input.phone !== before.phone) {
      const clash = await this.prisma.user.findFirst({ where: { phone: input.phone, deletedAt: null } });
      if (clash) throw AppError.conflict('PHONE_TAKEN');
    }
    // The last active owner cannot be deactivated — the farm must never lock itself out.
    if (input.isActive === false) await this.assertNotLastOwner(id);

    const user = await this.prisma.$transaction(async (tx) => {
      if (input.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      return tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          locale: input.locale,
          isActive: input.isActive,
          updatedBy: actorId,
          ...(input.newPassword
            ? { passwordHash: await argon2.hash(input.newPassword, { type: argon2.argon2id }) }
            : {}),
        },
        select: PUBLIC_FIELDS,
      });
    });
    await this.audit.log('update', 'User', id, { fullName: before.fullName, phone: before.phone, isActive: before.isActive }, { ...input, newPassword: input.newPassword ? '(changed)' : undefined });
    await this.audit.version('User', id, { fullName: user.fullName, phone: user.phone, email: user.email, isActive: user.isActive, roles: user.roles.map((r) => r.role.name) });
    return { ...user, roles: user.roles.map((r) => r.role) };
  }

  private async assertNotLastOwner(userId: string): Promise<void> {
    const owners = await this.prisma.userRole.findMany({
      where: { role: { name: 'owner' }, user: { isActive: true, deletedAt: null } },
      select: { userId: true },
    });
    if (owners.length === 1 && owners[0].userId === userId) {
      throw AppError.conflict('LAST_OWNER');
    }
  }
}
