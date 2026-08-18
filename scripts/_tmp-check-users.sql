SELECT name, email, "emailVerified", status, "updatedAt"
FROM users
WHERE email LIKE '%example.com'
ORDER BY email;
