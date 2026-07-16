import { z } from 'zod';
import { Ulid } from './herd';

// Pilot-scoped scaffold (docs/iot/PILOT-EXECUTION-PLAN.md §7) — not the
// full Section 13 contract set. No provisioning/reassign/alert inputs yet.

export const IotDeviceType = z.enum(['ear_tag', 'ble_gateway', 'rfid_reader', 'env_sensor']);

export const RegisterDeviceInput = z.object({
  deviceType: IotDeviceType,
  serialNumber: z.string().trim().min(1).max(64),
  animalId: Ulid.optional(),
  installLocation: z.string().trim().max(200).optional(),
}).refine((v) => v.deviceType !== 'ear_tag' || v.animalId, {
  message: 'errors.ear_tag_requires_animal', path: ['animalId'],
});
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceInput>;

export const SensorReadingBatchInput = z.object({
  readings: z.array(z.object({
    deviceId: Ulid,
    readingType: z.string().trim().min(1).max(64),
    capturedAt: z.string().datetime(),
    value: z.coerce.number().optional(),
    valueJson: z.record(z.any()).optional(),
    gatewayId: Ulid.optional(),
  })).min(1).max(500),
});
export type SensorReadingBatchInput = z.infer<typeof SensorReadingBatchInput>;
