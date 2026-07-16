-- CreateEnum
CREATE TYPE "IotDeviceType" AS ENUM ('ear_tag', 'ble_gateway', 'rfid_reader', 'env_sensor');

-- CreateEnum
CREATE TYPE "IotDeviceStatus" AS ENUM ('active', 'inactive', 'lost', 'retired');

-- CreateTable
CREATE TABLE "iot_devices" (
    "id" CHAR(26) NOT NULL,
    "device_type" "IotDeviceType" NOT NULL,
    "serial_number" TEXT NOT NULL,
    "animal_id" CHAR(26),
    "status" "IotDeviceStatus" NOT NULL DEFAULT 'active',
    "api_key_hash" TEXT,
    "install_location" TEXT,
    "battery_pct" INTEGER,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "iot_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_readings" (
    "id" CHAR(26) NOT NULL,
    "device_id" CHAR(26) NOT NULL,
    "reading_type" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(10,4),
    "value_json" JSONB,
    "gateway_id" CHAR(26),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "iot_devices_device_type_status_idx" ON "iot_devices"("device_type", "status");

-- CreateIndex
CREATE INDEX "iot_devices_animal_id_idx" ON "iot_devices"("animal_id");

-- CreateIndex
CREATE INDEX "sensor_readings_device_id_captured_at_idx" ON "sensor_readings"("device_id", "captured_at" DESC);

-- AddForeignKey
ALTER TABLE "iot_devices" ADD CONSTRAINT "iot_devices_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "iot_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Soft-delete-aware uniqueness: a retired device's serial number can be reissued.
CREATE UNIQUE INDEX uq_iot_devices_serial_live ON "iot_devices" (serial_number) WHERE deleted_at IS NULL;
