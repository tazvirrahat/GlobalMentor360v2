SELECT c.title, c.status, c."updatedAt",
  (SELECT count(*) FROM enrollments e WHERE e."courseId" = c.id AND e."revokedAt" IS NULL) AS learners
FROM courses c
JOIN users u ON u.id = c."instructorId"
WHERE u.email = 'instructor@example.com'
ORDER BY c."updatedAt" DESC;
