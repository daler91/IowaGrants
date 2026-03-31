-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GrantType" AS ENUM ('FEDERAL', 'STATE', 'LOCAL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('OPEN', 'CLOSED', 'FORECASTED');

-- CreateEnum
CREATE TYPE "GenderFocus" AS ENUM ('WOMEN', 'VETERAN', 'MINORITY', 'GENERAL', 'ANY');

-- CreateEnum
CREATE TYPE "BusinessStage" AS ENUM ('STARTUP', 'EXISTING', 'BOTH');

-- CreateTable
CREATE TABLE "Grant" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "amount" TEXT,
    "amountMin" INTEGER,
    "amountMax" INTEGER,
    "deadline" TIMESTAMP(3),
    "eligibility" TEXT,
    "grantType" "GrantType" NOT NULL,
    "status" "GrantStatus" NOT NULL DEFAULT 'OPEN',
    "businessStage" "BusinessStage" NOT NULL DEFAULT 'BOTH',
    "gender" "GenderFocus" NOT NULL DEFAULT 'ANY',
    "locations" TEXT[],
    "industries" TEXT[],
    "pdfUrl" TEXT,
    "rawData" JSONB,
    "lastVerified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibleExpense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "EligibleExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredUrl" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "contentHash" TEXT,
    "lastChecked" TIMESTAMP(3),
    "lastChanged" TIMESTAMP(3),
    "needsReparse" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoredUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "grantsFound" INTEGER NOT NULL DEFAULT 0,
    "grantsNew" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GrantCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GrantCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GrantExpenses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GrantExpenses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Grant_sourceUrl_key" ON "Grant"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EligibleExpense_name_key" ON "EligibleExpense"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredUrl_url_key" ON "MonitoredUrl"("url");

-- CreateIndex
CREATE INDEX "_GrantCategories_B_index" ON "_GrantCategories"("B");

-- CreateIndex
CREATE INDEX "_GrantExpenses_B_index" ON "_GrantExpenses"("B");

-- AddForeignKey
ALTER TABLE "_GrantCategories" ADD CONSTRAINT "_GrantCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GrantCategories" ADD CONSTRAINT "_GrantCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GrantExpenses" ADD CONSTRAINT "_GrantExpenses_A_fkey" FOREIGN KEY ("A") REFERENCES "EligibleExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GrantExpenses" ADD CONSTRAINT "_GrantExpenses_B_fkey" FOREIGN KEY ("B") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

