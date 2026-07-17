-- CreateEnum
CREATE TYPE "FeatureKind" AS ENUM ('plot', 'building', 'zone', 'line', 'point');

-- CreateTable
CREATE TABLE "site_layouts" (
    "id" CHAR(26) NOT NULL,
    "name" TEXT NOT NULL,
    "plan_attachment_id" CHAR(26),
    "plan_width" INTEGER,
    "plan_height" INTEGER,
    "anchors" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "site_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_features" (
    "id" CHAR(26) NOT NULL,
    "layout_id" CHAR(26) NOT NULL,
    "kind" "FeatureKind" NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "geometry" JSONB NOT NULL,
    "ref_type" TEXT,
    "ref_id" CHAR(26),
    "z_index" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "site_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_features_layout_id_kind_idx" ON "site_features"("layout_id", "kind");

-- AddForeignKey
ALTER TABLE "site_features" ADD CONSTRAINT "site_features_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "site_layouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written (docs/layout/01 §3) ────────────────────────────────
-- One live layout: v1 is one farm, one map. Dropping this index is the
-- entire multi-layout migration if that day comes.
CREATE UNIQUE INDEX "site_layouts_singleton"
  ON "site_layouts" ((true)) WHERE "deleted_at" IS NULL;

-- A fodder plot / shed / device can be drawn on the map once.
CREATE UNIQUE INDEX "site_features_ref_unique"
  ON "site_features" ("layout_id", "ref_type", "ref_id")
  WHERE "deleted_at" IS NULL AND "ref_type" IS NOT NULL;

-- Integrity floor: kind-specific vertex minimums live in contracts.
ALTER TABLE "site_features"
  ADD CONSTRAINT "site_features_geometry_nonempty"
  CHECK (jsonb_typeof("geometry") = 'array' AND jsonb_array_length("geometry") >= 1);
