-- Proves schema-hardening constraints: review rating range, course-delete
-- cannot cascade enrollments/certs/reviews, order-delete cannot cascade payments.
-- Runs inside a transaction that is rolled back, so nothing persists.
--
-- ON_ERROR_STOP must stay ON — see the note in payment-constraints.sql.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  _user   text;
  _course text;
  _order  text;
  _passed int := 0;
  _failed int := 0;

BEGIN
  SELECT id INTO _user FROM users WHERE email = 'instructor@example.com';

  INSERT INTO courses (id, title, slug, "instructorId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'Hardening probe', 'schema-hardening-' || gen_random_uuid()::text,
          _user, now(), now())
  RETURNING id INTO _course;

  -- 1. Rating 0 -> MUST REJECT
  BEGIN
    INSERT INTO reviews (id, "userId", "courseId", rating, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, _user, _course, 0, now(), now());
    RAISE WARNING 'FAIL  rating 0 was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  rating 0 -> rejected';
    _passed := _passed + 1;
  END;

  -- 2. Rating 6 -> MUST REJECT
  BEGIN
    INSERT INTO reviews (id, "userId", "courseId", rating, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, _user, _course, 6, now(), now());
    RAISE WARNING 'FAIL  rating 6 was ACCEPTED';
    _failed := _failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  rating 6 -> rejected';
    _passed := _passed + 1;
  END;

  -- 3. Rating 5 -> MUST ACCEPT (then we delete it so the course-delete cases stay clean)
  BEGIN
    INSERT INTO reviews (id, "userId", "courseId", rating, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, _user, _course, 5, now(), now());
    RAISE NOTICE 'PASS  rating 5 -> accepted';
    _passed := _passed + 1;
    DELETE FROM reviews WHERE "courseId" = _course;
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'FAIL  rating 5 was REJECTED';
    _failed := _failed + 1;
  END;

  -- 4. Course with an enrollment must not delete (would have cascaded the row)
  INSERT INTO enrollments (id, "userId", "courseId", source)
  VALUES (gen_random_uuid()::text, _user, _course, 'GRANT');
  BEGIN
    DELETE FROM courses WHERE id = _course;
    RAISE WARNING 'FAIL  course with enrollment was DELETED';
    _failed := _failed + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS  course with enrollment -> delete rejected';
    _passed := _passed + 1;
  END;
  DELETE FROM enrollments WHERE "courseId" = _course;

  -- 5. Course with a certificate must not delete
  INSERT INTO certificates (id, "userId", "courseId", serial)
  VALUES (gen_random_uuid()::text, _user, _course, 'SERIAL-' || gen_random_uuid()::text);
  BEGIN
    DELETE FROM courses WHERE id = _course;
    RAISE WARNING 'FAIL  course with certificate was DELETED';
    _failed := _failed + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS  course with certificate -> delete rejected';
    _passed := _passed + 1;
  END;
  DELETE FROM certificates WHERE "courseId" = _course;

  -- 6. Course with a review must not delete
  INSERT INTO reviews (id, "userId", "courseId", rating, "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, _user, _course, 4, now(), now());
  BEGIN
    DELETE FROM courses WHERE id = _course;
    RAISE WARNING 'FAIL  course with review was DELETED';
    _failed := _failed + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS  course with review -> delete rejected';
    _passed := _passed + 1;
  END;
  DELETE FROM reviews WHERE "courseId" = _course;

  -- 7. Never-purchased course (no enrollments/certs/reviews) still deletes
  BEGIN
    DELETE FROM courses WHERE id = _course;
    IF NOT FOUND THEN
      RAISE WARNING 'FAIL  empty course was NOT deleted';
      _failed := _failed + 1;
    ELSE
      RAISE NOTICE 'PASS  empty course -> deleted';
      _passed := _passed + 1;
    END IF;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE WARNING 'FAIL  empty course delete was REJECTED';
    _failed := _failed + 1;
  END;

  -- Recreate a course for the payment-trail case (the previous one is gone).
  INSERT INTO courses (id, title, slug, "instructorId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'Hardening probe 2', 'schema-hardening-2-' || gen_random_uuid()::text,
          _user, now(), now())
  RETURNING id INTO _course;

  INSERT INTO orders (id, "userId", status, currency, subtotal, discount, tax, total, "createdAt")
  VALUES (gen_random_uuid()::text, _user, 'PENDING', 'BDT', 4900, 0, 0, 4900, now())
  RETURNING id INTO _order;

  INSERT INTO payments (id, "orderId", "userId", method, status, amount, currency,
                        "bkashTransactionId", "bkashPhoneNumber", "createdAt")
  VALUES (gen_random_uuid()::text, _order, _user, 'BKASH', 'PENDING_VERIFICATION', 4900, 'BDT',
          'TXNHARDEN1', '01712345678', now());

  -- 8. Order with a payment must not delete
  BEGIN
    DELETE FROM orders WHERE id = _order;
    RAISE WARNING 'FAIL  order with payment was DELETED';
    _failed := _failed + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS  order with payment -> delete rejected';
    _passed := _passed + 1;
  END;

  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'passed=% failed=%', _passed, _failed;
  IF _failed > 0 THEN
    RAISE EXCEPTION 'CONSTRAINT TESTS FAILED';
  END IF;
END $$;

ROLLBACK;
