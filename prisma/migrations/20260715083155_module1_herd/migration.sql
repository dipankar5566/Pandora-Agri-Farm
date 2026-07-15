-- CreateEnum
CREATE TYPE "PenPurpose" AS ENUM ('general', 'kidding', 'buck', 'kid', 'isolation', 'hospital', 'quarantine', 'fattening');

-- CreateEnum
CREATE TYPE "AnimalSex" AS ENUM ('female', 'male', 'wether');

-- CreateEnum
CREATE TYPE "AnimalSource" AS ENUM ('born_on_farm', 'purchased', 'gift', 'exchange', 'other');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('active', 'sold', 'died', 'disposed', 'culled', 'lost');

-- CreateEnum
CREATE TYPE "ExitType" AS ENUM ('sale', 'death', 'disposal', 'cull_sale', 'lost');

-- CreateTable
CREATE TABLE "breeds" (
    "id" CHAR(26) NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "gestation_days" INTEGER NOT NULL DEFAULT 150,
    "adult_weight_kg" DECIMAL(6,3),
    "puberty_age_days" INTEGER,
    "kidding_interval_target_days" INTEGER NOT NULL DEFAULT 240,

    CONSTRAINT "breeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheds" (
    "id" CHAR(26) NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,

    CONSTRAINT "sheds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pens" (
    "id" CHAR(26) NOT NULL,
    "shed_id" CHAR(26) NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" "PenPurpose" NOT NULL DEFAULT 'general',
    "capacity" INTEGER,

    CONSTRAINT "pens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animals" (
    "id" CHAR(26) NOT NULL,
    "tag_number" TEXT NOT NULL,
    "rfid_tag" TEXT,
    "name" TEXT,
    "breed_id" CHAR(26) NOT NULL,
    "cross_percent" INTEGER,
    "sex" "AnimalSex" NOT NULL,
    "birth_date" DATE NOT NULL,
    "birth_date_estimated" BOOLEAN NOT NULL DEFAULT false,
    "dam_id" CHAR(26),
    "sire_id" CHAR(26),
    "source" "AnimalSource" NOT NULL,
    "purchase_price" DECIMAL(12,2),
    "purchase_date" DATE,
    "supplier_name" TEXT,
    "status" "AnimalStatus" NOT NULL DEFAULT 'active',
    "status_date" DATE,
    "current_pen_id" CHAR(26),
    "group_label" TEXT,
    "color_markings" TEXT,
    "current_weight_kg" DECIMAL(6,3),
    "current_bcs" DECIMAL(2,1),
    "insurance" JSONB,
    "medical_notes" TEXT,
    "notes" TEXT,
    "photo_attachment_id" CHAR(26),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_records" (
    "id" CHAR(26) NOT NULL,
    "animal_id" CHAR(26) NOT NULL,
    "weighed_on" DATE NOT NULL,
    "weight_kg" DECIMAL(6,3) NOT NULL,
    "bcs" DECIMAL(2,1),
    "method" TEXT NOT NULL DEFAULT 'scale',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "weight_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_events" (
    "id" CHAR(26) NOT NULL,
    "animal_id" CHAR(26) NOT NULL,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "summary_code" TEXT NOT NULL,
    "summary_params" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "animal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pen_movements" (
    "id" CHAR(26) NOT NULL,
    "animal_id" CHAR(26) NOT NULL,
    "from_pen_id" CHAR(26),
    "to_pen_id" CHAR(26) NOT NULL,
    "moved_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'routine',
    "notes" TEXT,
    "created_by" CHAR(26),

    CONSTRAINT "pen_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_exits" (
    "id" CHAR(26) NOT NULL,
    "animal_id" CHAR(26) NOT NULL,
    "exit_type" "ExitType" NOT NULL,
    "exit_date" DATE NOT NULL,
    "buyer_name" TEXT,
    "live_weight_kg" DECIMAL(6,3),
    "price" DECIMAL(12,2),
    "cause_category" TEXT,
    "cause_detail" TEXT,
    "post_mortem_done" BOOLEAN,
    "disposal_method" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "animal_exits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" CHAR(26) NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" CHAR(26) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "file_path" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "breeds_name_key" ON "breeds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sheds_name_key" ON "sheds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "pens_shed_id_name_key" ON "pens"("shed_id", "name");

-- CreateIndex
CREATE INDEX "animals_status_idx" ON "animals"("status");

-- CreateIndex
CREATE INDEX "animals_breed_id_idx" ON "animals"("breed_id");

-- CreateIndex
CREATE INDEX "animals_current_pen_id_idx" ON "animals"("current_pen_id");

-- CreateIndex
CREATE INDEX "animals_dam_id_idx" ON "animals"("dam_id");

-- CreateIndex
CREATE INDEX "animals_sire_id_idx" ON "animals"("sire_id");

-- CreateIndex
CREATE INDEX "weight_records_animal_id_weighed_on_idx" ON "weight_records"("animal_id", "weighed_on" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "weight_records_animal_id_weighed_on_key" ON "weight_records"("animal_id", "weighed_on");

-- CreateIndex
CREATE INDEX "animal_events_animal_id_occurred_at_idx" ON "animal_events"("animal_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "animal_events_event_type_occurred_at_idx" ON "animal_events"("event_type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "animal_exits_animal_id_key" ON "animal_exits"("animal_id");

-- CreateIndex
CREATE INDEX "attachments_entity_type_entity_id_idx" ON "attachments"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "pens" ADD CONSTRAINT "pens_shed_id_fkey" FOREIGN KEY ("shed_id") REFERENCES "sheds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_breed_id_fkey" FOREIGN KEY ("breed_id") REFERENCES "breeds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_current_pen_id_fkey" FOREIGN KEY ("current_pen_id") REFERENCES "pens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_dam_id_fkey" FOREIGN KEY ("dam_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_sire_id_fkey" FOREIGN KEY ("sire_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_events" ADD CONSTRAINT "animal_events_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_movements" ADD CONSTRAINT "pen_movements_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_movements" ADD CONSTRAINT "pen_movements_from_pen_id_fkey" FOREIGN KEY ("from_pen_id") REFERENCES "pens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_movements" ADD CONSTRAINT "pen_movements_to_pen_id_fkey" FOREIGN KEY ("to_pen_id") REFERENCES "pens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_exits" ADD CONSTRAINT "animal_exits_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Integrity beyond Prisma (Phase 3 §1.7, §4, §8) ──────────────────

-- Biology CHECKs: the database refuses impossible data.
ALTER TABLE "animals"
  ADD CONSTRAINT chk_animal_weight CHECK (current_weight_kg IS NULL OR (current_weight_kg >= 0.4 AND current_weight_kg <= 150)),
  ADD CONSTRAINT chk_animal_bcs CHECK (current_bcs IS NULL OR (current_bcs >= 1.0 AND current_bcs <= 5.0)),
  ADD CONSTRAINT chk_animal_cross CHECK (cross_percent IS NULL OR (cross_percent BETWEEN 1 AND 99)),
  ADD CONSTRAINT chk_animal_birth CHECK (birth_date <= CURRENT_DATE),
  ADD CONSTRAINT chk_animal_price CHECK (purchase_price IS NULL OR purchase_price >= 0),
  ADD CONSTRAINT chk_not_own_parent CHECK (id <> dam_id AND id <> sire_id);

ALTER TABLE "weight_records"
  ADD CONSTRAINT chk_weight_range CHECK (weight_kg >= 0.4 AND weight_kg <= 150),
  ADD CONSTRAINT chk_weight_bcs CHECK (bcs IS NULL OR (bcs >= 1.0 AND bcs <= 5.0));

ALTER TABLE "animal_exits"
  ADD CONSTRAINT chk_exit_price CHECK (price IS NULL OR price >= 0);

ALTER TABLE "breeds"
  ADD CONSTRAINT chk_gestation CHECK (gestation_days BETWEEN 140 AND 160);

-- Soft-delete-aware uniqueness: a deleted tag can be reissued.
CREATE UNIQUE INDEX uq_animals_tag_live ON "animals" (tag_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_animals_rfid_live ON "animals" (rfid_tag) WHERE rfid_tag IS NOT NULL AND deleted_at IS NULL;

-- Parent sex + exit-after-birth rules (cross-row: triggers, not CHECKs).
CREATE OR REPLACE FUNCTION trg_check_parent_sex() RETURNS trigger AS $$
BEGIN
  IF NEW.dam_id IS NOT NULL AND
     (SELECT sex FROM animals WHERE id = NEW.dam_id) <> 'female' THEN
    RAISE EXCEPTION 'DAM_NOT_FEMALE';
  END IF;
  IF NEW.sire_id IS NOT NULL AND
     (SELECT sex FROM animals WHERE id = NEW.sire_id) <> 'male' THEN
    RAISE EXCEPTION 'SIRE_NOT_MALE';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER animals_parent_sex BEFORE INSERT OR UPDATE OF dam_id, sire_id ON animals
  FOR EACH ROW EXECUTE FUNCTION trg_check_parent_sex();

CREATE OR REPLACE FUNCTION trg_check_exit_date() RETURNS trigger AS $$
BEGIN
  IF NEW.exit_date < (SELECT birth_date FROM animals WHERE id = NEW.animal_id) THEN
    RAISE EXCEPTION 'EXIT_BEFORE_BIRTH';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER exits_date_check BEFORE INSERT OR UPDATE ON animal_exits
  FOR EACH ROW EXECUTE FUNCTION trg_check_exit_date();

-- Fuzzy search on tag/name (universal search, Phase 2 §3.11).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_animals_tag_trgm ON "animals" USING gin (tag_number gin_trgm_ops);
CREATE INDEX idx_animals_name_trgm ON "animals" USING gin (name gin_trgm_ops) WHERE name IS NOT NULL;
