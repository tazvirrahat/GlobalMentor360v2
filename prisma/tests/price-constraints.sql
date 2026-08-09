-- Proves the partial unique index on prices enforces exactly what it claims:
-- one ACTIVE price per (course, currency), any number of archived ones, and no
-- interference between currencies.
-- Runs entirely inside a transaction that is rolled back, so nothing persists.
--
-- ON_ERROR_STOP must stay ON — see the note in payment-constraints.sql. With it
-- off a failing run still exits 0, which makes this file decorative.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  _course text;
  _passed int := 0;
  _failed int := 0;

BEGIN
  SELECT id INTO _course FROM courses WHERE slug = 'typescript-foundations';

  -- Start from a clean slate for this course so the seeded prices do not decide
  -- the outcome of the cases below.
  DELETE FROM prices WHERE "courseId" = _course;

  -- 1. First active USD price -> MUST ACCEPT
  BEGIN
    INSERT INTO prices (id,"courseId",currency,amount,"isActive")
    VALUES (gen_random_uuid()::text,_course,'USD',4900,true);
    RAISE NOTICE 'PASS  first active USD price -> accepted';
    _passed := _passed + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'FAIL  first active USD price was REJECTED';
    _failed := _failed + 1;
  END;

  -- 2. THE LOAD-BEARING ONE.
  --
  -- A second ACTIVE price in the same currency is what made the catalog price
  -- nondeterministic: two rows match `isActive = true` and the code took
  -- whichever one Postgres handed back first. It has to be impossible, not
  -- merely avoided by the write path that happens to exist today.
  BEGIN
    INSERT INTO prices (id,"courseId",currency,amount,"isActive")
    VALUES (gen_random_uuid()::text,_course,'USD',9900,true);
    RAISE WARNING 'FAIL  second active USD price was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS  second active USD price -> rejected';
    _passed := _passed + 1;
  END;

  -- 3. An active BDT price alongside the active USD one -> MUST ACCEPT.
  -- bKash cannot sell a course without a BDT price, so this is the normal state
  -- of a course on both rails, not an edge case.
  BEGIN
    INSERT INTO prices (id,"courseId",currency,amount,"isActive")
    VALUES (gen_random_uuid()::text,_course,'BDT',599000,true);
    RAISE NOTICE 'PASS  active BDT price beside active USD -> accepted';
    _passed := _passed + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'FAIL  active BDT price beside active USD was REJECTED';
    _failed := _failed + 1;
  END;

  -- 4. Price history: many archived USD rows -> MUST ACCEPT.
  -- The constraint this replaced keyed on isActive, so it allowed exactly one
  -- inactive row per currency and the second archived price collided.
  BEGIN
    INSERT INTO prices (id,"courseId",currency,amount,"isActive")
    VALUES (gen_random_uuid()::text,_course,'USD',3900,false),
           (gen_random_uuid()::text,_course,'USD',2900,false),
           (gen_random_uuid()::text,_course,'USD',1900,false);
    RAISE NOTICE 'PASS  three archived USD prices -> accepted';
    _passed := _passed + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'FAIL  archived USD price history was REJECTED';
    _failed := _failed + 1;
  END;

  -- 5. Archive the active row, then activate a replacement -> MUST ACCEPT.
  -- This is the studio save path (app/studio/actions.ts setActivePrice): the old
  -- price is deactivated and a new one inserted inside one transaction.
  BEGIN
    UPDATE prices SET "isActive" = false
    WHERE "courseId" = _course AND currency = 'USD' AND "isActive";

    INSERT INTO prices (id,"courseId",currency,amount,"isActive")
    VALUES (gen_random_uuid()::text,_course,'USD',7900,true);
    RAISE NOTICE 'PASS  archive-then-replace active USD price -> accepted';
    _passed := _passed + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'FAIL  archive-then-replace was REJECTED';
    _failed := _failed + 1;
  END;

  -- 6. Reactivating an archived row while another is active -> MUST REJECT.
  -- The index guards the state, not just the INSERT statement.
  BEGIN
    UPDATE prices SET "isActive" = true
    WHERE id = (
      SELECT id FROM prices
      WHERE "courseId" = _course AND currency = 'USD' AND NOT "isActive"
      LIMIT 1
    );
    RAISE WARNING 'FAIL  reactivating an archived USD price was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS  reactivating an archived USD price -> rejected';
    _passed := _passed + 1;
  END;

  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'passed=% failed=%', _passed, _failed;
  IF _failed > 0 THEN
    RAISE EXCEPTION 'CONSTRAINT TESTS FAILED';
  END IF;
END $$;

ROLLBACK;
