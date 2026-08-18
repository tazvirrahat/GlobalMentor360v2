SELECT u.email, n.type, n.payload->>'title' AS title, n.payload->>'href' AS href, n."readAt" IS NULL AS unread, n."createdAt"
FROM notifications n
JOIN users u ON u.id = n."userId"
WHERE u.email IN ('learner@example.com','instructor@example.com')
ORDER BY u.email, n."createdAt" DESC
LIMIT 40;
