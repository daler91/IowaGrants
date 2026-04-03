-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "grantsFound" INTEGER NOT NULL DEFAULT 0,
    "grantsNew" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);
