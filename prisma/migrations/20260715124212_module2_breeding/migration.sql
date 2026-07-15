-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('natural', 'ai');

-- CreateEnum
CREATE TYPE "DiagnosisMethod" AS ENUM ('ultrasound', 'palpation', 'non_return', 'ballottement', 'other');

-- CreateEnum
CREATE TYPE "DiagnosisResult" AS ENUM ('pregnant', 'open', 'inconclusive');

-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('ongoing', 'kidded', 'aborted', 'false_pregnancy');

-- DropIndex
DROP INDEX "idx_animals_tag_trgm";

-- CreateTable
CREATE TABLE "heat_records" (
    "id" CHAR(26) NOT NULL,
    "doe_id" CHAR(26) NOT NULL,
    "detected_on" DATE NOT NULL,
    "signs" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "heat_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" CHAR(26) NOT NULL,
    "doe_id" CHAR(26) NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "buck_id" CHAR(26),
    "semen_batch" TEXT,
    "semen_source" TEXT,
    "technician" TEXT,
    "service_date" DATE NOT NULL,
    "heat_record_id" CHAR(26),
    "override_reason" TEXT,
    "inbreeding_flag" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pregnancy_diagnoses" (
    "id" CHAR(26) NOT NULL,
    "service_id" CHAR(26) NOT NULL,
    "diagnosed_on" DATE NOT NULL,
    "method" "DiagnosisMethod" NOT NULL,
    "result" "DiagnosisResult" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "pregnancy_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pregnancies" (
    "id" CHAR(26) NOT NULL,
    "doe_id" CHAR(26) NOT NULL,
    "service_id" CHAR(26) NOT NULL,
    "confirmed_on" DATE NOT NULL,
    "expected_kidding_date" DATE NOT NULL,
    "status" "PregnancyStatus" NOT NULL DEFAULT 'ongoing',
    "abortion_date" DATE,
    "abortion_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "pregnancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiddings" (
    "id" CHAR(26) NOT NULL,
    "pregnancy_id" CHAR(26) NOT NULL,
    "kidding_date" DATE NOT NULL,
    "assisted" BOOLEAN NOT NULL DEFAULT false,
    "complication" TEXT NOT NULL DEFAULT 'none',
    "complication_notes" TEXT,
    "total_born" INTEGER NOT NULL,
    "born_alive" INTEGER NOT NULL,
    "attended_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "kiddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kid_records" (
    "animal_id" CHAR(26) NOT NULL,
    "kidding_id" CHAR(26) NOT NULL,
    "birth_order" INTEGER NOT NULL,
    "birth_weight_kg" DECIMAL(5,3),
    "colostrum_within_1h" BOOLEAN,
    "weaned_on" DATE,
    "weaning_weight_kg" DECIMAL(6,3),

    CONSTRAINT "kid_records_pkey" PRIMARY KEY ("animal_id")
);

-- CreateIndex
CREATE INDEX "heat_records_doe_id_detected_on_idx" ON "heat_records"("doe_id", "detected_on" DESC);

-- CreateIndex
CREATE INDEX "services_doe_id_service_date_idx" ON "services"("doe_id", "service_date" DESC);

-- CreateIndex
CREATE INDEX "services_buck_id_service_date_idx" ON "services"("buck_id", "service_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pregnancies_service_id_key" ON "pregnancies"("service_id");

-- CreateIndex
CREATE INDEX "pregnancies_status_expected_kidding_date_idx" ON "pregnancies"("status", "expected_kidding_date");

-- CreateIndex
CREATE INDEX "pregnancies_doe_id_idx" ON "pregnancies"("doe_id");

-- CreateIndex
CREATE UNIQUE INDEX "kiddings_pregnancy_id_key" ON "kiddings"("pregnancy_id");

-- CreateIndex
CREATE INDEX "kid_records_kidding_id_idx" ON "kid_records"("kidding_id");

-- AddForeignKey
ALTER TABLE "pregnancy_diagnoses" ADD CONSTRAINT "pregnancy_diagnoses_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiddings" ADD CONSTRAINT "kiddings_pregnancy_id_fkey" FOREIGN KEY ("pregnancy_id") REFERENCES "pregnancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kid_records" ADD CONSTRAINT "kid_records_kidding_id_fkey" FOREIGN KEY ("kidding_id") REFERENCES "kiddings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Breeding integrity (Phase 3 §5)
ALTER TABLE "services"
  ADD CONSTRAINT chk_service_buck CHECK (service_type = 'ai' OR buck_id IS NOT NULL),
  ADD CONSTRAINT chk_service_semen CHECK (service_type = 'natural' OR semen_batch IS NOT NULL);

ALTER TABLE "kiddings"
  ADD CONSTRAINT chk_kidding_born CHECK (total_born BETWEEN 1 AND 6 AND born_alive >= 0 AND born_alive <= total_born);

ALTER TABLE "kid_records"
  ADD CONSTRAINT chk_kid_birth_weight CHECK (birth_weight_kg IS NULL OR (birth_weight_kg >= 0.4 AND birth_weight_kg <= 7.0)),
  ADD CONSTRAINT chk_kid_birth_order CHECK (birth_order BETWEEN 1 AND 6);

ALTER TABLE "pregnancies"
  ADD CONSTRAINT chk_abortion_fields CHECK (status <> 'aborted' OR (abortion_date IS NOT NULL AND abortion_reason IS NOT NULL));

-- One ongoing pregnancy per doe, ever.
CREATE UNIQUE INDEX uq_pregnancy_ongoing_per_doe ON "pregnancies" (doe_id) WHERE status = 'ongoing';
