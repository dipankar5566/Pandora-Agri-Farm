-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('medicine', 'vaccine', 'dewormer', 'feed', 'mineral', 'supplement', 'consumable', 'equipment');

-- CreateEnum
CREATE TYPE "ItemUnit" AS ENUM ('kg', 'g', 'l', 'ml', 'piece', 'dose', 'vial', 'bag', 'bottle', 'packet', 'tablet');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('opening', 'purchase', 'consumption', 'adjustment', 'wastage', 'expiry_writeoff', 'return');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" CHAR(26) NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "supplier_type" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" CHAR(26) NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "unit" "ItemUnit" NOT NULL,
    "category" TEXT,
    "anthelmintic_class" TEXT,
    "default_dose_per_kg" DECIMAL(8,4),
    "dose_unit" TEXT,
    "withdrawal_days" INTEGER,
    "min_stock_level" DECIMAL(10,3),
    "reorder_qty" DECIMAL(10,3),
    "cost_price_latest" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_batches" (
    "id" CHAR(26) NOT NULL,
    "item_id" CHAR(26) NOT NULL,
    "batch_no" TEXT,
    "expiry_date" DATE,
    "supplier_id" CHAR(26),
    "received_on" DATE NOT NULL,
    "qty_received" DECIMAL(10,3) NOT NULL,
    "qty_remaining" DECIMAL(10,3) NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "mrp" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "item_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" CHAR(26) NOT NULL,
    "item_id" CHAR(26) NOT NULL,
    "batch_id" CHAR(26),
    "movement_type" "MovementType" NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "moved_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "items_item_type_idx" ON "items"("item_type");

-- CreateIndex
CREATE INDEX "item_batches_item_id_expiry_date_idx" ON "item_batches"("item_id", "expiry_date");

-- CreateIndex
CREATE INDEX "stock_movements_item_id_moved_at_idx" ON "stock_movements"("item_id", "moved_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_batch_id_idx" ON "stock_movements"("batch_id");

-- AddForeignKey
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Inventory integrity (Phase 3 §7)
ALTER TABLE "item_batches"
  ADD CONSTRAINT chk_batch_qty CHECK (qty_received > 0 AND qty_remaining >= 0 AND qty_remaining <= qty_received);

ALTER TABLE "stock_movements"
  ADD CONSTRAINT chk_movement_qty CHECK (qty <> 0),
  ADD CONSTRAINT chk_adjustment_reason CHECK (
    movement_type NOT IN ('adjustment', 'wastage', 'expiry_writeoff') OR reason IS NOT NULL
  );

-- Live uniqueness for item names within a type.
CREATE UNIQUE INDEX uq_items_name_type_live ON "items" (name, item_type) WHERE deleted_at IS NULL;

-- Fuzzy search for universal search.
CREATE INDEX idx_items_name_trgm ON "items" USING gin (name gin_trgm_ops);
CREATE INDEX idx_suppliers_name_trgm ON "suppliers" USING gin (name gin_trgm_ops);

-- The quantity ledger is the source of truth: every batch-linked movement
-- updates qty_remaining; the CHECK above makes negative stock impossible.
CREATE OR REPLACE FUNCTION trg_apply_stock_movement() RETURNS trigger AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE item_batches SET qty_remaining = qty_remaining + NEW.qty WHERE id = NEW.batch_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BATCH_NOT_FOUND';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movement_applies AFTER INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION trg_apply_stock_movement();

-- Movements are append-only: corrections are new counter-movements.
CREATE OR REPLACE FUNCTION trg_forbid() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'STOCK_MOVEMENTS_APPEND_ONLY';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION trg_forbid();

-- Medicines/vaccines/dewormers must carry an expiry on stock-in.
CREATE OR REPLACE FUNCTION trg_check_batch_expiry_required() RETURNS trigger AS $$
DECLARE t "ItemType";
BEGIN
  SELECT item_type INTO t FROM items WHERE id = NEW.item_id;
  IF t IN ('medicine', 'vaccine', 'dewormer') AND NEW.expiry_date IS NULL THEN
    RAISE EXCEPTION 'EXPIRY_REQUIRED';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER batch_expiry_required BEFORE INSERT ON item_batches
  FOR EACH ROW EXECUTE FUNCTION trg_check_batch_expiry_required();
