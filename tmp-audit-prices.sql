SELECT c.title, c.status, p.currency, p.amount, p."isActive"
FROM courses c
LEFT JOIN prices p ON p."courseId" = c.id
WHERE c.status = 'PUBLISHED'
ORDER BY c.title, p.currency;
