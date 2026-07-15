-- CreateEnum
CREATE TYPE "CaseSeverity" AS ENUM ('mild', 'moderate', 'severe', 'critical');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('open', 'monitoring', 'recovered', 'died', 'referred');

-- CreateEnum
CREATE TYPE "TreatmentRoute" AS ENUM ('oral', 'sc', 'im', 'iv', 'topical', 'intranasal', 'other');

-- CreateEnum
CREATE TYPE "ProtocolType" AS ENUM ('vaccination', 'deworming', 'dipping', 'other');

-- CreateEnum
CREATE TYPE "ProtocolAppliesTo" AS ENUM ('all', 'female', 'male', 'kid', 'adult', 'pregnant');

-- CreateEnum
CREATE TYPE "DueStatus" AS ENUM ('pending', 'done', 'skipped');

-- DropIndex
DROP INDEX "idx_items_name_trgm";

-- DropIndex
DROP INDEX "idx_suppliers_name_trgm";

-- CreateTable
CREATE TABLE "health_cases" (
    "id" CHAR(26) NOT NULL,
    "animal_id" CHAR(26) NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "symptoms" TEXT NOT NULL,
    "provisional_diagnosis" TEXT,
    "final_diagnosis" TEXT,
    "severity" "CaseSeverity" NOT NULL,
    "vet_name" TEXT,
    "is_isolated" BOOLEAN NOT NULL DEFAULT false,
    "isolation_pen_id" CHAR(26),
    "status" "CaseStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMP(3),
    "outcome_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),

    CONSTRAINT "health_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_vitals" (
    "id" CHAR(26) NOT NULL,
    "case_id" CHAR(26) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "temperature_c" DECIMAL(4,2),
    "pulse_bpm" INTEGER,
    "respiration_rpm" INTEGER,
    "notes" TEXT,
    "recorded_by" CHAR(26),

    CONSTRAINT "case_vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatments" (
    "id" CHAR(26) NOT NULL,
    "animal_id" CHAR(26) NOT NULL,
    "case_id" CHAR(26),
    "treated_at" TIMESTAMP(3) NOT NULL,
    "item_id" CHAR(26) NOT NULL,
    "batch_id" CHAR(26),
    "dose_amount" DECIMAL(8,3) NOT NULL,
    "dose_unit" TEXT NOT NULL,
    "route" "TreatmentRoute" NOT NULL,
    "weight_at_treatment_kg" DECIMAL(6,3),
    "withdrawal_until" DATE,
    "given_by" CHAR(26),
    "prescribed_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_protocols" (
    "id" CHAR(26) NOT NULL,
    "type" "ProtocolType" NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "default_item_id" CHAR(26),
    "first_dose_age_days" INTEGER,
    "booster_after_days" INTEGER,
    "repeat_interval_days" INTEGER,
    "dose_per_kg" DECIMAL(8,4),
    "dose_fixed" DECIMAL(8,3),
    "dose_unit" TEXT,
    "applies_to" "ProtocolAppliesTo" NOT NULL DEFAULT 'all',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "health_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_dues" (
    "id" CHAR(26) NOT NULL,
    "protocol_id" CHAR(26) NOT NULL,
    "animal_id" CHAR(26) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "DueStatus" NOT NULL DEFAULT 'pending',
    "fulfilled_by_id" CHAR(26),
    "skip_reason" TEXT,

    CONSTRAINT "protocol_dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_administrations" (
    "id" CHAR(26) NOT NULL,
    "protocol_id" CHAR(26) NOT NULL,
    "animal_id" CHAR(26) NOT NULL,
    "given_on" DATE NOT NULL,
    "item_id" CHAR(26),
    "batch_id" CHAR(26),
    "dose_amount" DECIMAL(8,3),
    "dose_unit" TEXT,
    "weight_at_admin_kg" DECIMAL(6,3),
    "anthelmintic_class_snapshot" TEXT,
    "withdrawal_until" DATE,
    "given_by" CHAR(26),
    "vet_name" TEXT,
    "next_due_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_administrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_cases_animal_id_opened_at_idx" ON "health_cases"("animal_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "health_cases_status_idx" ON "health_cases"("status");

-- CreateIndex
CREATE INDEX "treatments_animal_id_treated_at_idx" ON "treatments"("animal_id", "treated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "health_protocols_name_key" ON "health_protocols"("name");

-- CreateIndex
CREATE INDEX "protocol_dues_status_due_date_idx" ON "protocol_dues"("status", "due_date");

-- CreateIndex
CREATE INDEX "protocol_dues_animal_id_idx" ON "protocol_dues"("animal_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_dues_protocol_id_animal_id_due_date_key" ON "protocol_dues"("protocol_id", "animal_id", "due_date");

-- CreateIndex
CREATE INDEX "protocol_administrations_animal_id_given_on_idx" ON "protocol_administrations"("animal_id", "given_on" DESC);

-- CreateIndex
CREATE INDEX "protocol_administrations_protocol_id_animal_id_given_on_idx" ON "protocol_administrations"("protocol_id", "animal_id", "given_on" DESC);

-- AddForeignKey
ALTER TABLE "case_vitals" ADD CONSTRAINT "case_vitals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "health_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "health_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_dues" ADD CONSTRAINT "protocol_dues_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "health_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_administrations" ADD CONSTRAINT "protocol_administrations_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "health_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vitals within goat-plausible ranges (Phase 3 §6.2)
ALTER TABLE "case_vitals"
  ADD CONSTRAINT chk_vital_temp CHECK (temperature_c IS NULL OR (temperature_c >= 35.0 AND temperature_c <= 43.0)),
  ADD CONSTRAINT chk_vital_pulse CHECK (pulse_bpm IS NULL OR (pulse_bpm BETWEEN 40 AND 200)),
  ADD CONSTRAINT chk_vital_resp CHECK (respiration_rpm IS NULL OR (respiration_rpm BETWEEN 10 AND 90));

ALTER TABLE "treatments"
  ADD CONSTRAINT chk_treatment_dose CHECK (dose_amount > 0);

ALTER TABLE "health_cases"
  ADD CONSTRAINT chk_isolation_pen CHECK (NOT is_isolated OR isolation_pen_id IS NOT NULL);
