import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../prisma.service';

/**
 * Notification engine (Phase 2 §3.10). Two real channels:
 *  - inapp: always on — the bell in the top bar reads these rows.
 *  - email: activates when SMTP_* env vars are set (any Gmail app password
 *    works); silently skipped otherwise — never a fake "sent".
 * WhatsApp/SMS need the farm's own provider accounts (Meta Cloud API /
 * MSG91 with DLT registration) — deferred until those exist, by design.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  private emailTransport() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL_TO } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !NOTIFY_EMAIL_TO) return null;
    return {
      to: NOTIFY_EMAIL_TO,
      transport: nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT ?? 587),
        secure: Number(SMTP_PORT ?? 587) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      }),
    };
  }

  /** The morning digest: everything that needs attention today, one notification. */
  async generateDailyDigest() {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 86400000);
    const [duesOverdue, kiddingsSoon, openCases, lowStock, expiring, tasksDue] = await Promise.all([
      this.prisma.protocolDue.count({ where: { status: 'pending', dueDate: { lt: now } } }),
      this.prisma.pregnancy.count({ where: { status: 'ongoing', expectedKiddingDate: { lte: in7d } } }),
      this.prisma.healthCase.count({ where: { status: { in: ['open', 'monitoring'] } } }),
      this.inventory.listItems({ belowMin: true }).then((r) => r.length),
      this.inventory.expiring(14).then((r) => r.length),
      this.prisma.task.count({ where: { status: 'pending', dueOn: { lte: now } } }),
    ]);
    const counts = { duesOverdue, kiddingsSoon, openCases, lowStock, expiring, tasksDue };
    const totalItems = Object.values(counts).reduce((n, c) => n + c, 0);

    const lines = [
      `Pandora Goat Farm — daily digest ${now.toISOString().slice(0, 10)}`,
      '',
      duesOverdue ? `• ${duesOverdue} vaccinations/deworming OVERDUE` : null,
      kiddingsSoon ? `• ${kiddingsSoon} kiddings expected within 7 days` : null,
      openCases ? `• ${openCases} open health cases` : null,
      lowStock ? `• ${lowStock} items below minimum stock` : null,
      expiring ? `• ${expiring} medicine batches expire within 14 days` : null,
      tasksDue ? `• ${tasksDue} tasks due today` : null,
      totalItems === 0 ? 'All clear — nothing needs attention today. 🎉' : null,
    ].filter(Boolean).join('\n');

    const severity = duesOverdue > 0 || openCases > 0 ? 'warning' : 'info';
    const inapp = await this.prisma.notification.create({
      data: {
        id: ulid(), type: 'daily_digest', severity,
        titleCode: 'notif.daily_digest', params: counts as object,
        body: lines, channel: 'inapp', status: 'sent', sentAt: now,
      },
    });

    // Email leg — only when configured.
    const email = this.emailTransport();
    let emailStatus: string | null = null;
    if (email) {
      const row = await this.prisma.notification.create({
        data: {
          id: ulid(), type: 'daily_digest', severity,
          titleCode: 'notif.daily_digest', params: counts as object,
          body: lines, channel: 'email',
        },
      });
      try {
        await email.transport.sendMail({
          from: process.env.SMTP_USER,
          to: email.to,
          subject: `🐐 Pandora daily digest — ${totalItems === 0 ? 'all clear' : `${totalItems} items need attention`}`,
          text: lines,
        });
        await this.prisma.notification.update({
          where: { id: row.id }, data: { status: 'sent', sentAt: new Date() },
        });
        emailStatus = 'sent';
      } catch (e) {
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { status: 'failed', error: String(e).slice(0, 500) },
        });
        emailStatus = 'failed';
      }
    }
    await this.audit.log('create', 'Notification', inapp.id, null, { type: 'daily_digest', counts, emailStatus });
    return { counts, severity, emailStatus: emailStatus ?? 'not_configured' };
  }

  async list(unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { channel: 'inapp', ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { id: 'desc' },
      take: 30,
    });
  }

  async unreadCount() {
    return this.prisma.notification.count({ where: { channel: 'inapp', readAt: null } });
  }

  async markRead(id: string) {
    await this.prisma.notification.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead() {
    const res = await this.prisma.notification.updateMany({
      where: { channel: 'inapp', readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: res.count };
  }
}
