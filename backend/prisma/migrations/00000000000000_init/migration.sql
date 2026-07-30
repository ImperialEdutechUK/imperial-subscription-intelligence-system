-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL DEFAULT '#DA291C',
    "costCentre" TEXT,
    "headName" TEXT,
    "headEmail" TEXT,
    "headcount" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "provider" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CORPORATE_CREDIT',
    "holderName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "currentBalance" DOUBLE PRECISION,
    "balanceUpdatedAt" TIMESTAMP(3),
    "lowBalanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardTopUp" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "url" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "accountEmail" TEXT,
    "username" TEXT,
    "passwordCipher" TEXT,
    "passwordUpdatedAt" TIMESTAMP(3),
    "credentialLocation" TEXT,
    "mfaNotes" TEXT,
    "cardId" TEXT,
    "billingModel" TEXT NOT NULL DEFAULT 'MONTHLY',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "unitAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "perSeat" BOOLEAN NOT NULL DEFAULT false,
    "usageUnitLabel" TEXT,
    "usageRatePerUnit" DOUBLE PRECISION,
    "estimatedMonthlyUnits" DOUBLE PRECISION,
    "topUpAmount" DOUBLE PRECISION,
    "topUpThreshold" DOUBLE PRECISION,
    "creditBalance" DOUBLE PRECISION,
    "creditBalanceUpdatedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "noticePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "cancellationUrl" TEXT,
    "allocationMethod" TEXT NOT NULL DEFAULT 'OWNER_PAYS',
    "ownerDepartmentId" TEXT,
    "ownerName" TEXT,
    "ownerEmail" TEXT,
    "notes" TEXT,
    "tags" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION,
    "seats" INTEGER,
    "note" TEXT,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostChange" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "previousAmount" DOUBLE PRECISION,
    "newAmount" DOUBLE PRECISION NOT NULL,
    "previousModel" TEXT,
    "newModel" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "reason" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "cardId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "paidDate" TIMESTAMP(3),
    "invoiceRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "units" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "code" TEXT NOT NULL,
    "rateToGbp" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "payload" TEXT,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "CardTopUp_cardId_occurredAt_idx" ON "CardTopUp"("cardId", "occurredAt");

-- CreateIndex
CREATE INDEX "Subscription_status_archived_idx" ON "Subscription"("status", "archived");

-- CreateIndex
CREATE INDEX "Subscription_renewalDate_idx" ON "Subscription"("renewalDate");

-- CreateIndex
CREATE INDEX "Subscription_category_idx" ON "Subscription"("category");

-- CreateIndex
CREATE INDEX "Allocation_departmentId_idx" ON "Allocation"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_subscriptionId_departmentId_key" ON "Allocation"("subscriptionId", "departmentId");

-- CreateIndex
CREATE INDEX "CostChange_subscriptionId_effectiveDate_idx" ON "CostChange"("subscriptionId", "effectiveDate");

-- CreateIndex
CREATE INDEX "CostChange_effectiveDate_idx" ON "CostChange"("effectiveDate");

-- CreateIndex
CREATE INDEX "Charge_dueDate_status_idx" ON "Charge"("dueDate", "status");

-- CreateIndex
CREATE INDEX "Charge_subscriptionId_idx" ON "Charge"("subscriptionId");

-- CreateIndex
CREATE INDEX "UsageRecord_subscriptionId_periodEnd_idx" ON "UsageRecord"("subscriptionId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "ReminderLog_sentAt_idx" ON "ReminderLog"("sentAt");

-- AddForeignKey
ALTER TABLE "CardTopUp" ADD CONSTRAINT "CardTopUp_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_ownerDepartmentId_fkey" FOREIGN KEY ("ownerDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostChange" ADD CONSTRAINT "CostChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

