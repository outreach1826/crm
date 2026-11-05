ALTER TABLE "mailboxSync" ADD COLUMN     "backfillFrom" TIMESTAMP(3),
ADD COLUMN     "backfillOffset" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "backfillPageToken" TEXT,
ADD COLUMN     "backfillUntil" TIMESTAMP(3);
