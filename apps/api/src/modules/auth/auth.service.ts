import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import type { LoginInput, UpdateMeInput } from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { sha256, SessionUser } from '../../common/auth.guard';
import { effectiveLevel } from '../../common/rbac';
import { MODULES } from '@pandora/contracts';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findFirst({
      where: { phone: input.phone, deletedAt: null },
    });
    // Uniform error for unknown phone vs wrong password — no user enumeration.
    const badCreds = new AppError(401, 'INVALID_CREDENTIALS', 'errors.invalid_credentials');
    if (!user || !user.isActive) throw badCreds;
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(401, 'ACCOUNT_LOCKED', 'errors.account_locked', {
        minutes: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000),
      });
    }

    if (!(await argon2.verify(user.passwordHash, input.password))) {
      const fails = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: fails,
          lockedUntil:
            fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
        },
      });
      throw badCreds;
    }

    const token = randomBytes(32).toString('hex');
    const sessionId = ulid();
    const expiresAt = new Date(Date.now() + TTL_DAYS * 86400000);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.session.create({
        data: { id: sessionId, tokenHash: sha256(token), userId: user.id, expiresAt, ip, userAgent },
      }),
    ]);
    await this.audit.log('login', 'User', user.id, null, { ip });

    return { cookie: `${sessionId}.${token}`, expiresAt, user: { id: user.id, fullName: user.fullName, locale: user.locale, theme: user.theme } };
  }

  async logout(su: SessionUser): Promise<void> {
    await this.prisma.session.delete({ where: { id: su.sessionId } }).catch(() => undefined);
    await this.audit.log('logout', 'User', su.id, null, null);
  }

  async me(su: SessionUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: su.id } });
    const permissions = Object.fromEntries(
      MODULES.map((m) => [m, effectiveLevel(su.perms, m)]),
    );
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      locale: user.locale,
      theme: user.theme,
      roles: su.roleNames,
      permissions,
    };
  }

  async updateMe(su: SessionUser, input: UpdateMeInput) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: su.id } });
    const data: Record<string, unknown> = {};
    if (input.locale) data.locale = input.locale;
    if (input.theme) data.theme = input.theme;
    if (input.newPassword) {
      if (!(await argon2.verify(user.passwordHash, input.currentPassword!))) {
        throw new AppError(400, 'CURRENT_PASSWORD_WRONG', 'errors.current_password_wrong', undefined, 'currentPassword');
      }
      data.passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    }
    const updated = await this.prisma.user.update({ where: { id: su.id }, data });
    await this.audit.log('update', 'User', su.id, { locale: user.locale, theme: user.theme }, { locale: updated.locale, theme: updated.theme, passwordChanged: !!input.newPassword });
    return this.me({ ...su, locale: updated.locale });
  }
}
