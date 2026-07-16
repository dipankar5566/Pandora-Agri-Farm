import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { randomBytes } from 'node:crypto';
import type { RegisterDeviceInput, SensorReadingBatchInput } from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { sha256 } from '../../common/auth.guard';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

/** Device types that authenticate via API key (ear tags never do — Section
 *  2 §2.8 kept per-tag crypto off the coin-cell power budget; identity is
 *  the gateway allowlist instead, which this pilot scaffold doesn't yet
 *  implement — Foundation-stage). */
const KEYED_TYPES = new Set(['ble_gateway', 'rfid_reader', 'env_sensor']);

@Injectable()
export class IotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listDevices() {
    return this.prisma.iotDevice.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async registerDevice(input: RegisterDeviceInput, actor: string) {
    const clash = await this.prisma.iotDevice.findFirst({
      where: { serialNumber: input.serialNumber, deletedAt: null },
    });
    if (clash) throw AppError.conflict('SERIAL_TAKEN');

    if (input.animalId) {
      const animal = await this.prisma.animal.findFirst({ where: { id: input.animalId, deletedAt: null } });
      if (!animal) throw AppError.notFound('animal');
    }

    const id = ulid();
    let apiKey: string | undefined;
    let apiKeyHash: string | undefined;
    if (KEYED_TYPES.has(input.deviceType)) {
      apiKey = randomBytes(24).toString('hex'); // returned once, plaintext — never stored (Section 19 §2.6)
      apiKeyHash = sha256(apiKey);
    }

    const device = await this.prisma.iotDevice.create({
      data: {
        id,
        deviceType: input.deviceType,
        serialNumber: input.serialNumber,
        animalId: input.animalId,
        installLocation: input.installLocation,
        apiKeyHash,
        createdBy: actor,
      },
    });
    await this.audit.log('create', 'IotDevice', id, null, {
      deviceType: input.deviceType, serialNumber: input.serialNumber, animalId: input.animalId,
    });
    return { ...device, apiKey };
  }

  /**
   * The API key authenticates the *reporting* device — the gateway/reader/
   * env_sensor that's actually POSTing this batch — not every reading's
   * subject. Most readings are about an ear tag relayed by a gateway
   * (`gatewayId` set, ear tags never hold their own key, Section 2 §2.8);
   * a reader/env_sensor posting about itself has no `gatewayId`, so it
   * authenticates as its own subject. Subjects still have to exist and be
   * active (so retired/unknown devices can't accumulate new data), they
   * just don't each need to match the presented key.
   *
   * No audit.log here — telemetry ingestion is high-volume, not a
   * master-record change (Section 2 §10 / Section 13 §2.7).
   */
  async ingestReadings(deviceKeyHeader: string | undefined, batch: SensorReadingBatchInput) {
    if (!deviceKeyHeader) throw new AppError(401, 'DEVICE_KEY_INVALID', 'errors.device_key_invalid');
    const providedHash = sha256(deviceKeyHeader);

    const subjectIds = [...new Set(batch.readings.map((r) => r.deviceId))];
    const reporterIds = [...new Set(batch.readings.map((r) => r.gatewayId ?? r.deviceId))];
    const allIds = [...new Set([...subjectIds, ...reporterIds])];
    const devices = await this.prisma.iotDevice.findMany({ where: { id: { in: allIds }, deletedAt: null } });
    const byId = new Map(devices.map((d) => [d.id, d]));

    for (const id of subjectIds) {
      const device = byId.get(id);
      if (!device) throw AppError.notFound('device');
      if (device.status !== 'active') throw AppError.conflict('DEVICE_INACTIVE');
    }
    for (const id of reporterIds) {
      const device = byId.get(id);
      if (!device) throw AppError.notFound('device');
      if (device.status !== 'active') throw AppError.conflict('DEVICE_INACTIVE');
      if (!device.apiKeyHash || device.apiKeyHash !== providedHash) {
        throw new AppError(401, 'DEVICE_KEY_INVALID', 'errors.device_key_invalid');
      }
    }

    const latestBatteryBySubject = new Map<string, number>();
    for (const r of batch.readings) {
      if (r.readingType === 'battery_pct' && typeof r.value === 'number') {
        latestBatteryBySubject.set(r.deviceId, Math.round(r.value));
      }
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.sensorReading.createMany({
        data: batch.readings.map((r) => ({
          id: ulid(),
          deviceId: r.deviceId,
          readingType: r.readingType,
          capturedAt: new Date(r.capturedAt),
          value: r.value,
          valueJson: r.valueJson,
          gatewayId: r.gatewayId,
        })),
      });
      for (const id of allIds) {
        await tx.iotDevice.update({
          where: { id },
          data: {
            lastSeenAt: now,
            ...(latestBatteryBySubject.has(id) ? { batteryPct: latestBatteryBySubject.get(id) } : {}),
          },
        });
      }
    });

    return { accepted: batch.readings.length };
  }

  async listReadings(deviceId: string, from?: string, to?: string) {
    const device = await this.prisma.iotDevice.findFirst({ where: { id: deviceId, deletedAt: null } });
    if (!device) throw AppError.notFound('device');
    return this.prisma.sensorReading.findMany({
      where: {
        deviceId,
        capturedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      orderBy: { capturedAt: 'desc' },
      take: 2000,
    });
  }
}
