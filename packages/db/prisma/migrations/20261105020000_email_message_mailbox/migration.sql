ALTER TABLE "emailMessage" ADD COLUMN     "gmailThreadId" TEXT,
ADD COLUMN     "mailbox" TEXT;

UPDATE "emailMessage" m
SET "mailbox" = lower(u."email")
FROM "user" u
WHERE m."syncedByUserId" = u."id" AND m."gmailMessageId" IS NOT NULL;

CREATE INDEX "emailMessage_mailbox_gmailThreadId_idx" ON "emailMessage"("mailbox", "gmailThreadId");

CREATE UNIQUE INDEX "emailMessage_mailbox_gmailMessageId_key" ON "emailMessage"("mailbox", "gmailMessageId");
