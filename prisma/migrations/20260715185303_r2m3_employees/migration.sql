-- CreateEnum
CREATE TYPE "WageType" AS ENUM ('monthly', 'daily');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'half_day', 'leave');

-- CreateTable
CREATE TABLE "employees" (
    "id" CHAR(26) NOT NULL,
    "full_name" TEXT NOT NULL,
    "name_bn" TEXT,
    "phone" TEXT,
    "designation" TEXT,
    "wage_type" "WageType" NOT NULL,
    "wage_rate" DECIMAL(12,2) NOT NULL,
    "joined_on" DATE NOT NULL,
    "left_on" DATE,
    "user_id" CHAR(26),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" CHAR(26),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" CHAR(26),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" CHAR(26) NOT NULL,
    "employee_id" CHAR(26) NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" CHAR(26) NOT NULL,
    "employee_id" CHAR(26) NOT NULL,
    "period_month" TEXT NOT NULL,
    "days_present" INTEGER NOT NULL,
    "days_half" INTEGER NOT NULL,
    "days_leave" INTEGER NOT NULL,
    "days_absent" INTEGER NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "paid_on" DATE,
    "payment_method" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" CHAR(26),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_records_date_idx" ON "attendance_records"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employee_id_date_key" ON "attendance_records"("employee_id", "date");

-- CreateIndex
CREATE INDEX "payroll_runs_period_month_idx" ON "payroll_runs"("period_month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_employee_id_period_month_key" ON "payroll_runs"("employee_id", "period_month");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employees"
  ADD CONSTRAINT chk_wage_rate CHECK (wage_rate > 0);
ALTER TABLE "payroll_runs"
  ADD CONSTRAINT chk_payroll_amounts CHECK (gross_amount >= 0 AND bonus >= 0 AND deductions >= 0 AND net_amount >= 0),
  ADD CONSTRAINT chk_payroll_days CHECK (days_present >= 0 AND days_half >= 0 AND days_leave >= 0 AND days_absent >= 0),
  ADD CONSTRAINT chk_period_format CHECK (period_month ~ '^\d{4}-\d{2}$');
