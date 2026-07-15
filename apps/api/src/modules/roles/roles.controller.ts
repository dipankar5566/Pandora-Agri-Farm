import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PatchPermissionsInput } from '@pandora/contracts';
import { Perm } from '../../common/auth.guard';
import { AppError } from '../../common/errors';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Perm('settings', 'view')
  async list() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { select: { module: true, level: true } } },
      orderBy: { name: 'asc' },
    });
    return { data: roles };
  }

  @Patch(':id/permissions')
  @Perm('settings', 'approve')
  async patchPermissions(
    @Param('id') id: string,
    @Body(new ZodPipe(PatchPermissionsInput)) body: PatchPermissionsInput,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw AppError.notFound('role');
    // The owner role's approve-everything grant is immutable (RBAC-04 anchor).
    if (role.name === 'owner') throw AppError.conflict('ROLE_LOCKED');

    await this.prisma.$transaction(
      body.permissions.map((p) =>
        this.prisma.rolePermission.upsert({
          where: { roleId_module: { roleId: id, module: p.module } },
          create: { roleId: id, module: p.module, level: p.level },
          update: { level: p.level },
        }),
      ),
    );
    await this.audit.log('update', 'Role', id, { permissions: role.permissions }, { permissions: body.permissions });
    const updated = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { select: { module: true, level: true } } },
    });
    return { data: updated };
  }
}
