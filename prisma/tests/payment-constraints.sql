-- Proves the payments CHECK constraints reject bad writes.
-- Runs entirely inside a transaction that is rolled back, so nothing persists.
--
-- ON_ERROR_STOP must stay ON: with it off, psql walks past the final
-- `RAISE EXCEPTION 'CONSTRAINT TESTS FAILED'` and still exits 0, so a broken
-- constraint reports as a passing test run. The individual cases below catch
-- check_violation inside the DO block, so nothing reaches psql except a genuine
-- failure. The trailing ROLLBACK does not run in that case and does not need to:
-- an aborted transaction is discarded when the session closes.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  _user   text;
  _admin  text;
  _order  text;
  _passed int := 0;
  _failed int := 0;

BEGIN
  SELECT id INTO _user  FROM users WHERE email = 'instructor@example.com';
  SELECT id INTO _admin FROM users WHERE email = 'admin@example.com';

  INSERT INTO orders (id, "userId", status, currency, subtotal, discount, tax, total, "createdAt")
  VALUES (gen_random_uuid()::text, _user, 'PENDING', 'BDT', 4900, 0, 0, 4900, now())
  RETURNING id INTO _order;

  -- 1. bKash COMPLETED without a verifier  -> MUST REJECT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,
                          "bkashTransactionId","bkashPhoneNumber","createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'BKASH','COMPLETED',4900,'BDT',
            'TXN123','01712345678',now());
    RAISE WARNING 'FAIL  bKash COMPLETED without verifier was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  bKash COMPLETED without verifier -> rejected';
    _passed := _passed + 1;
  END;

  -- 2. bKash without transaction id -> MUST REJECT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,
                          "bkashPhoneNumber","createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'BKASH','PENDING_VERIFICATION',4900,'BDT',
            '01712345678',now());
    RAISE WARNING 'FAIL  bKash without transaction id was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  bKash without transaction id -> rejected';
    _passed := _passed + 1;
  END;

  -- 3. bKash with malformed phone -> MUST REJECT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,
                          "bkashTransactionId","bkashPhoneNumber","createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'BKASH','PENDING_VERIFICATION',4900,'BDT',
            'TXN123','+8801712345678',now());
    RAISE WARNING 'FAIL  bKash malformed phone was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  bKash malformed phone -> rejected';
    _passed := _passed + 1;
  END;

  -- 4. bKash in USD -> MUST REJECT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,
                          "bkashTransactionId","bkashPhoneNumber","createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'BKASH','PENDING_VERIFICATION',4900,'USD',
            'TXN123','01712345678',now());
    RAISE WARNING 'FAIL  bKash in USD was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  bKash in USD -> rejected';
    _passed := _passed + 1;
  END;

  -- 5. Stripe stuck in PENDING_VERIFICATION -> MUST REJECT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,"createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'STRIPE','PENDING_VERIFICATION',4900,'USD',now());
    RAISE WARNING 'FAIL  Stripe PENDING_VERIFICATION was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  Stripe PENDING_VERIFICATION -> rejected';
    _passed := _passed + 1;
  END;

  -- 6. Stripe COMPLETED without payment intent -> MUST REJECT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,"createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'STRIPE','COMPLETED',4900,'USD',now());
    RAISE WARNING 'FAIL  Stripe COMPLETED without intent was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  Stripe COMPLETED without intent -> rejected';
    _passed := _passed + 1;
  END;

  -- --- Now the writes that MUST be allowed ---

  -- 7. bKash awaiting verification -> MUST ACCEPT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,
                          "bkashTransactionId","bkashPhoneNumber","createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'BKASH','PENDING_VERIFICATION',4900,'BDT',
            'TXN123','01712345678',now());
    RAISE NOTICE 'PASS  bKash awaiting verification -> accepted';
    _passed := _passed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'FAIL  valid pending bKash was REJECTED';
    _failed := _failed + 1;
  END;

  -- 8. bKash COMPLETED *with* a verifier -> MUST ACCEPT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,
                          "bkashTransactionId","bkashPhoneNumber","verifiedById","verifiedAt","createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'BKASH','COMPLETED',4900,'BDT',
            'TXN456','01712345678',_admin,now(),now());
    RAISE NOTICE 'PASS  bKash COMPLETED with verifier -> accepted';
    _passed := _passed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'FAIL  verified bKash was REJECTED';
    _failed := _failed + 1;
  END;

  -- 9. Stripe COMPLETED with intent -> MUST ACCEPT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,
                          "stripePaymentIntentId","createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'STRIPE','COMPLETED',4900,'USD','pi_test_123',now());
    RAISE NOTICE 'PASS  Stripe COMPLETED with intent -> accepted';
    _passed := _passed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'FAIL  valid Stripe payment was REJECTED';
    _failed := _failed + 1;
  END;

  -- 10. Duplicate bKash trx ID while pending -> MUST REJECT
  BEGIN
    INSERT INTO payments (id,"orderId","userId",method,status,amount,currency,
                          "bkashTransactionId","bkashPhoneNumber","createdAt")
    VALUES (gen_random_uuid()::text,_order,_user,'BKASH','PENDING_VERIFICATION',4900,'BDT',
            'TXN123','01712345678',now());
    RAISE WARNING 'FAIL  duplicate bKash trx ID was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS  duplicate bKash trx ID -> rejected';
    _passed := _passed + 1;
  END;

  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'passed=% failed=%', _passed, _failed;
  IF _failed > 0 THEN
    RAISE EXCEPTION 'CONSTRAINT TESTS FAILED';
  END IF;
END $$;

ROLLBACK;
