-- Partial unique index: the same bKash transaction ID cannot sit on two
-- payments that are still awaiting verification or already completed.
-- FAILED (rejected) and REFUNDED rows drop out of the index so a declined
-- proof can be resubmitted with the same ID.
--
-- Prisma cannot express partial unique indexes in schema.prisma — same pattern
-- as prices_course_currency_active_key in 20260807000002.

CREATE UNIQUE INDEX "payments_bkash_transaction_id_active_key"
  ON "payments" ("bkashTransactionId")
  WHERE "method" = 'BKASH'
    AND "status" IN ('PENDING_VERIFICATION', 'COMPLETED')
    AND "bkashTransactionId" IS NOT NULL;
