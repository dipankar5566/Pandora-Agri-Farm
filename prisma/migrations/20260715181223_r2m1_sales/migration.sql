-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('individual', 'trader', 'butcher', 'institution', 'other');

-- CreateEnum
CREATE TYPE "SaleLineType" AS ENUM ('animal', 'manure', 'vermicompost', 'feed', 'other');

-- CreateTable
CREATE TABLE "customers" (
    "id" CHAR(26) NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "customer_type" "CustomerType" NOT NULL DEFAULT 'individual',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_invoices" (
    "id" CHAR(26) NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "customer_id" CHAR(26),
    "buyer_name" TEXT,
    "invoice_date" DATE NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "sale_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_invoice_lines" (
    "id" CHAR(26) NOT NULL,
    "invoice_id" CHAR(26) NOT NULL,
    "line_type" "SaleLineType" NOT NULL,
    "animal_id" CHAR(26),
    "description" TEXT NOT NULL,
    "hsn_code" TEXT,
    "qty" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "gst_rate_pct" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" CHAR(26) NOT NULL,
    "customer_id" CHAR(26),
    "invoice_id" CHAR(26),
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "paid_on" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_invoices_invoice_no_key" ON "sale_invoices"("invoice_no");

-- CreateIndex
CREATE INDEX "sale_invoices_invoice_date_idx" ON "sale_invoices"("invoice_date" DESC);

-- CreateIndex
CREATE INDEX "sale_invoices_customer_id_idx" ON "sale_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "sale_invoice_lines_invoice_id_idx" ON "sale_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "sale_invoice_lines_animal_id_idx" ON "sale_invoice_lines"("animal_id");

-- CreateIndex
CREATE INDEX "sale_payments_invoice_id_idx" ON "sale_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "sale_payments_customer_id_paid_on_idx" ON "sale_payments"("customer_id", "paid_on" DESC);

-- AddForeignKey
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoice_lines" ADD CONSTRAINT "sale_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sale_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sale_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_invoices"
  ADD CONSTRAINT chk_invoice_amounts CHECK (subtotal >= 0 AND tax_amount >= 0 AND total >= 0);
ALTER TABLE "sale_invoice_lines"
  ADD CONSTRAINT chk_line_amounts CHECK (qty > 0 AND unit_price >= 0 AND amount >= 0 AND gst_rate_pct >= 0 AND gst_rate_pct <= 28),
  ADD CONSTRAINT chk_animal_line CHECK (line_type <> 'animal' OR animal_id IS NOT NULL);
ALTER TABLE "sale_payments"
  ADD CONSTRAINT chk_payment_amount CHECK (amount > 0);
CREATE INDEX idx_customers_name_trgm ON "customers" USING gin (name gin_trgm_ops);
