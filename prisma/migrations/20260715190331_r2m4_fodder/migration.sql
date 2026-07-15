-- CreateEnum
CREATE TYPE "CropStatus" AS ENUM ('growing', 'harvested', 'failed');

-- CreateEnum
CREATE TYPE "FodderForm" AS ENUM ('green', 'hay', 'silage');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'production';

-- CreateTable
CREATE TABLE "fodder_plots" (
    "id" CHAR(26) NOT NULL,
    "name" TEXT NOT NULL,
    "block" TEXT,
    "area_decimal" DECIMAL(8,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "fodder_plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fodder_crops" (
    "id" CHAR(26) NOT NULL,
    "plot_id" CHAR(26) NOT NULL,
    "crop_name" TEXT NOT NULL,
    "variety" TEXT,
    "sown_on" DATE NOT NULL,
    "expected_harvest_on" DATE,
    "status" "CropStatus" NOT NULL DEFAULT 'growing',
    "closed_on" DATE,
    "fail_reason" TEXT,
    "cost_total" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "fodder_crops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fodder_harvests" (
    "id" CHAR(26) NOT NULL,
    "crop_id" CHAR(26) NOT NULL,
    "harvested_on" DATE NOT NULL,
    "form" "FodderForm" NOT NULL,
    "qty_kg" DECIMAL(10,3) NOT NULL,
    "dry_matter_pct" DECIMAL(4,1),
    "item_id" CHAR(26) NOT NULL,
    "batch_id" CHAR(26) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "fodder_harvests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fodder_plots_name_key" ON "fodder_plots"("name");

-- CreateIndex
CREATE INDEX "fodder_crops_status_idx" ON "fodder_crops"("status");

-- CreateIndex
CREATE INDEX "fodder_harvests_crop_id_idx" ON "fodder_harvests"("crop_id");

-- AddForeignKey
ALTER TABLE "fodder_crops" ADD CONSTRAINT "fodder_crops_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "fodder_plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fodder_harvests" ADD CONSTRAINT "fodder_harvests_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "fodder_crops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fodder_crops"
  ADD CONSTRAINT chk_crop_cost CHECK (cost_total IS NULL OR cost_total >= 0),
  ADD CONSTRAINT chk_crop_fail CHECK (status <> 'failed' OR fail_reason IS NOT NULL);
ALTER TABLE "fodder_harvests"
  ADD CONSTRAINT chk_harvest_qty CHECK (qty_kg > 0),
  ADD CONSTRAINT chk_harvest_dm CHECK (dry_matter_pct IS NULL OR (dry_matter_pct > 0 AND dry_matter_pct <= 100));
