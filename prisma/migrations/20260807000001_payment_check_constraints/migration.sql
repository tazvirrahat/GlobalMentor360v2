-- Conditional CHECK constraints for the payments table.
--
-- Prisma cannot express CHECK constraints in schema.prisma, so they live here.
-- If you regenerate the schema, these survive — but any new payment method needs
-- its own constraints added deliberately.
--
-- The pattern is `method != 'X' OR <requirement>`: the requirement applies only
-- to rail X, without making the column mandatory for every other rail.
--
-- Prior art: docs/PRIOR-ART.md#1-conditional-check-constraints-for-multi-method-payments

-- A bKash payment is worthless without the learner's transaction id — it is the
-- only way an admin can find the payment in the bKash portal to verify it.
ALTER TABLE "payments"
  ADD CONSTRAINT "ck_payments_bkash_requires_transaction_id"
  CHECK ("method" != 'BKASH' OR "bkashTransactionId" IS NOT NULL);

-- Bangladesh mobile format. Reject at write time rather than discovering a
-- typo'd number when an admin is trying to reconcile a payment.
ALTER TABLE "payments"
  ADD CONSTRAINT "ck_payments_bkash_phone_format"
  CHECK ("method" != 'BKASH' OR "bkashPhoneNumber" ~ '^01[0-9]{9}$');

-- bKash settles in BDT. A bKash payment recorded in USD is a data-entry error
-- that would silently corrupt revenue reporting.
ALTER TABLE "payments"
  ADD CONSTRAINT "ck_payments_bkash_currency_bdt"
  CHECK ("method" != 'BKASH' OR "currency" = 'BDT');

-- THE LOAD-BEARING ONE.
--
-- A manual payment cannot reach COMPLETED without recording which admin verified
-- it. Manual verification is where both fraud and honest error concentrate, and a
-- rule enforced only in a service method does not survive a deadline. This makes
-- "marked paid, nobody actually checked" structurally impossible rather than
-- merely discouraged.
--
-- Corollary: application code cannot bypass this, which is why the test for it
-- runs against the database directly rather than through the service layer.
ALTER TABLE "payments"
  ADD CONSTRAINT "ck_payments_bkash_completed_requires_verifier"
  CHECK (
    "method" != 'BKASH'
    OR "status" != 'COMPLETED'
    OR "verifiedById" IS NOT NULL
  );

-- Stripe's rail has the mirror requirement: a completed card payment must carry
-- the payment intent that proves it.
ALTER TABLE "payments"
  ADD CONSTRAINT "ck_payments_stripe_completed_requires_intent"
  CHECK (
    "method" != 'STRIPE'
    OR "status" != 'COMPLETED'
    OR "stripePaymentIntentId" IS NOT NULL
  );

-- PENDING_VERIFICATION is meaningless on an automated rail — Stripe either
-- succeeds or fails, there is nobody to wait for.
ALTER TABLE "payments"
  ADD CONSTRAINT "ck_payments_pending_verification_is_manual_only"
  CHECK ("status" != 'PENDING_VERIFICATION' OR "method" = 'BKASH');
