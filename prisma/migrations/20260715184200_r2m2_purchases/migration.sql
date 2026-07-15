-- DropIndex
DROP INDEX "idx_customers_name_trgm";

-- CreateTable
CREATE TABLE "purchase_bills" (
    "id" CHAR(26) NOT NULL,
    "purchase_no" TEXT NOT NULL,
    "bill_no" TEXT,
    "supplier_id" CHAR(26) NOT NULL,
    "bill_date" DATE NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "other_charges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "purchase_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_bill_lines" (
    "id" CHAR(26) NOT NULL,
    "bill_id" CHAR(26) NOT NULL,
    "item_id" CHAR(26) NOT NULL,
    "batch_id" CHAR(26) NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_payments" (
    "id" CHAR(26) NOT NULL,
    "supplier_id" CHAR(26) NOT NULL,
    "bill_id" CHAR(26),
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "paid_on" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "purchase_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_bills_purchase_no_key" ON "purchase_bills"("purchase_no");

-- CreateIndex
CREATE INDEX "purchase_bills_bill_date_idx" ON "purchase_bills"("bill_date" DESC);

-- CreateIndex
CREATE INDEX "purchase_bills_supplier_id_idx" ON "purchase_bills"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_bill_lines_bill_id_idx" ON "purchase_bill_lines"("bill_id");

-- CreateIndex
CREATE INDEX "purchase_bill_lines_item_id_idx" ON "purchase_bill_lines"("item_id");

-- CreateIndex
CREATE INDEX "purchase_payments_bill_id_idx" ON "purchase_payments"("bill_id");

-- CreateIndex
CREATE INDEX "purchase_payments_supplier_id_paid_on_idx" ON "purchase_payments"("supplier_id", "paid_on" DESC);

-- AddForeignKey
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_lines" ADD CONSTRAINT "purchase_bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "purchase_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "purchase_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_bills"
  ADD CONSTRAINT chk_pbill_amounts CHECK (subtotal >= 0 AND other_charges >= 0 AND total >= 0);
ALTER TABLE "purchase_bill_lines"
  ADD CONSTRAINT chk_pline_amounts CHECK (qty > 0 AND unit_cost >= 0 AND amount >= 0);
ALTER TABLE "purchase_payments"
  ADD CONSTRAINT chk_ppayment_amount CHECK (amount > 0);
