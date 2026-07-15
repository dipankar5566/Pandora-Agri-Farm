-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank', 'upi', 'cheque', 'credit');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'done', 'skipped');

-- CreateTable
CREATE TABLE "feed_logs" (
    "id" CHAR(26) NOT NULL,
    "fed_on" DATE NOT NULL,
    "pen_id" CHAR(26) NOT NULL,
    "item_id" CHAR(26) NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "wastage_qty" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "feed_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" CHAR(26) NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" CHAR(26) NOT NULL,
    "entry_date" DATE NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "category_id" CHAR(26) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "counterparty_name" TEXT,
    "animal_id" CHAR(26),
    "ref_type" TEXT,
    "ref_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" CHAR(26) NOT NULL,
    "title" TEXT NOT NULL,
    "task_type" TEXT NOT NULL DEFAULT 'custom',
    "due_on" DATE NOT NULL,
    "animal_id" CHAR(26),
    "pen_id" CHAR(26),
    "assigned_to" CHAR(26),
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "recurrence" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by" CHAR(26),
    "completion_notes" TEXT,
    "skip_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feed_logs_fed_on_idx" ON "feed_logs"("fed_on" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "feed_logs_fed_on_pen_id_item_id_key" ON "feed_logs"("fed_on", "pen_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_kind_name_key" ON "finance_categories"("kind", "name");

-- CreateIndex
CREATE INDEX "ledger_entries_entry_date_idx" ON "ledger_entries"("entry_date" DESC);

-- CreateIndex
CREATE INDEX "ledger_entries_kind_category_id_entry_date_idx" ON "ledger_entries"("kind", "category_id", "entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_animal_id_idx" ON "ledger_entries"("animal_id");

-- CreateIndex
CREATE INDEX "tasks_status_due_on_idx" ON "tasks"("status", "due_on");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feed_logs"
  ADD CONSTRAINT chk_feed_qty CHECK (qty > 0 AND wastage_qty >= 0 AND wastage_qty <= qty);
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT chk_ledger_amount CHECK (amount > 0);
