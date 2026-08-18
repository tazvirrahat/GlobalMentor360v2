SELECT p.status, p."bkashTransactionId", u.email, o.status AS order_status
FROM payments p
JOIN users u ON u.id = p."userId"
JOIN orders o ON o.id = p."orderId"
WHERE p.status = 'PENDING_VERIFICATION'
   OR p."bkashTransactionId" = 'AUDITPAY17AUG26A1';

SELECT e.source, c.title, u.email, e."revokedAt"
FROM enrollments e
JOIN courses c ON c.id = e."courseId"
JOIN users u ON u.id = e."userId"
WHERE u.email = 'learner@example.com';
