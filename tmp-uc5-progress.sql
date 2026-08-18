SELECT u.email,
       cp.percent AS stored_percent,
       cp."completedAt" AS stored_completed,
       ci.title,
       ci.type,
       ip."completedAt" AS item_completed,
       qa.passed,
       qa."scorePct"
FROM users u
LEFT JOIN enrollments e ON e."userId" = u.id AND e."revokedAt" IS NULL
LEFT JOIN courses c ON c.id = e."courseId" AND c.slug = 'typescript-foundations'
LEFT JOIN course_progress cp ON cp."userId" = u.id AND cp."courseId" = c.id
LEFT JOIN sections s ON s."courseId" = c.id
LEFT JOIN curriculum_items ci ON ci."sectionId" = s.id
LEFT JOIN item_progress ip ON ip."userId" = u.id AND ip."curriculumItemId" = ci.id
LEFT JOIN assessments a ON a."curriculumItemId" = ci.id
LEFT JOIN LATERAL (
  SELECT passed, "scorePct"
  FROM quiz_attempts
  WHERE "userId" = u.id AND "assessmentId" = a.id
  ORDER BY "submittedAt" DESC NULLS LAST
  LIMIT 1
) qa ON true
WHERE u.email = 'learner@example.com'
ORDER BY s.position, ci.position;
