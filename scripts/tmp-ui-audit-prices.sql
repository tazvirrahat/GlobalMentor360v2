SELECT c.slug, c.status, p.currency, p.amount, p."isActive"
FROM courses c
JOIN prices p ON p."courseId" = c.id
ORDER BY c.slug, p.currency;
