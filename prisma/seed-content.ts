/**
 * The development catalog, as data. prisma/seed.ts writes it; prisma/seed-content.test.ts
 * keeps it honest (real lesson text, one correct answer per question, the slugs and
 * prices the e2e suite depends on).
 *
 * Six small courses a Bangladeshi learner might actually buy. Every article is short
 * but teaches the thing its title says, so the player, the curriculum and the
 * certificate look like a real academy in screenshots and demos.
 */

export type SeedQuestion = {
  prompt: string;
  type: "SINGLE_CHOICE" | "TRUE_FALSE";
  explanation?: string;
  options: { text: string; correct: boolean }[];
};

export type SeedLesson =
  | { kind: "article"; title: string; minutes: number; preview?: boolean; body: string }
  | { kind: "quiz"; title: string; passPct: number; questions: SeedQuestion[] };

export type SeedCourse = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS";
  categorySlug: string;
  priceBdtMinor: number;
  priceUsdCents: number;
  objectives: string[];
  requirements: string[];
  audience: string[];
  faqs?: { question: string; answer: string }[];
  sections: { title: string; lessons: SeedLesson[] }[];
};

export type SeedLearner = {
  name: string;
  email: string;
  reviews: { courseSlug: string; rating: 1 | 2 | 3 | 4 | 5; body: string }[];
};

const trueFalse = (prompt: string, answer: boolean, explanation: string): SeedQuestion => ({
  prompt,
  type: "TRUE_FALSE",
  explanation,
  options: [
    { text: "True", correct: answer },
    { text: "False", correct: !answer },
  ],
});

const choice = (
  prompt: string,
  correct: string,
  wrong: string[],
  explanation: string,
): SeedQuestion => ({
  prompt,
  type: "SINGLE_CHOICE",
  explanation,
  options: [{ text: correct, correct: true }, ...wrong.map((text) => ({ text, correct: false }))],
});

export const SEED_COURSES: SeedCourse[] = [
  {
    slug: "typescript-foundations",
    title: "TypeScript Foundations",
    subtitle: "Types, generics, and the compiler settings that actually matter.",
    description:
      "A practical introduction to TypeScript for developers who already write JavaScript. You will set up the compiler, learn how the type system decides what is compatible, and type a small project end to end, including the API responses that usually end up as `any`.",
    level: "BEGINNER",
    categorySlug: "web-development",
    priceBdtMinor: 599000,
    priceUsdCents: 4900,
    objectives: [
      "Set up tsc with strict settings in an existing JavaScript project.",
      "Read a type error and fix the cause instead of silencing it.",
      "Use unions and narrowing to model data that has more than one shape.",
      "Write generic functions without reaching for any.",
      "Type the JSON your app receives from an API.",
    ],
    requirements: ["Comfortable writing modern JavaScript (let/const, arrow functions, modules)."],
    audience: [
      "JavaScript developers moving a project to TypeScript.",
      "Students who know JavaScript and keep seeing TypeScript in job posts.",
    ],
    faqs: [
      {
        question: "Do I need to install anything?",
        answer: "Node.js and a code editor. The second lesson walks through installing TypeScript and running `tsc`.",
      },
      {
        question: "Is this course for complete beginners?",
        answer: "It assumes you already write JavaScript. If you are new to programming, start with Python Basics.",
      },
      {
        question: "How long do I have access?",
        answer: "For as long as the course is available. Pay once and come back to any lesson whenever you like.",
      },
    ],
    sections: [
      {
        title: "Getting started",
        lessons: [
          {
            kind: "article",
            title: "Why TypeScript",
            minutes: 3,
            preview: true,
            body: `JavaScript tells you a value is undefined when the program runs, usually in front of a user. TypeScript tells you while you are typing. That is the whole trade: you describe the shape of your data once, and the compiler checks every place that uses it.

This matters most in code you did not write, or wrote six months ago. When a function says it takes a \`User\` and returns a \`Promise<Order[]>\`, you no longer have to open it to find out. Your editor can autocomplete fields, rename safely across files, and warn you when an API change breaks a caller.

TypeScript is still JavaScript. Every JavaScript file is a valid starting point, types are erased when the code is compiled, and nothing extra ships to the browser. You can adopt it one file at a time, which is how this course will treat it.`,
          },
          {
            kind: "article",
            title: "Setting up the compiler",
            minutes: 7,
            body: `Install TypeScript as a development dependency with \`npm install -D typescript\`, then run \`npx tsc --init\` to create a tsconfig.json. The generated file is long, but only a handful of settings matter at the start.

Set \`"strict": true\`. It turns on a group of checks, including noImplicitAny and strictNullChecks, that catch the bugs people actually adopt TypeScript for. Turning it on later, in a large codebase, is far more painful than starting with it.

Set \`"target"\` to a modern version such as ES2022 so the output is readable, and \`"noEmit": true\` if a bundler like Vite or Next.js already compiles your code. In that setup tsc is only a checker: run \`npx tsc --noEmit\` in CI so a type error fails the build.

Rename one file from .js to .ts, run the checker, and fix what it reports before moving to the next file.`,
          },
          {
            kind: "quiz",
            title: "Check: setup",
            passPct: 70,
            questions: [
              trueFalse(
                "TypeScript types are included in the JavaScript sent to the browser.",
                false,
                "Types are erased at compile time. Nothing extra ships to users.",
              ),
              choice(
                "Which tsconfig setting turns on noImplicitAny and strictNullChecks together?",
                "strict",
                ["target", "noEmit", "allowJs"],
                "strict enables the whole family of strict checks at once.",
              ),
              trueFalse(
                "You can move a JavaScript project to TypeScript one file at a time.",
                true,
                "Every .js file is a valid starting point; rename and fix files gradually.",
              ),
            ],
          },
        ],
      },
      {
        title: "The type system",
        lessons: [
          {
            kind: "article",
            title: "Structural typing",
            minutes: 10,
            body: `In Java or C#, a value is a \`Customer\` because it was declared as one. TypeScript works differently: a value is compatible with a type if it has the right shape. If a function expects \`{ name: string }\`, any object with a string \`name\` is accepted, whatever else it carries and whatever it was called.

This is called structural typing, and it fits JavaScript, where objects are built from literals, spread, and JSON far more often than from classes.

It has one surprise. Passing an object literal directly adds an excess property check, so \`greet({ name: "Rahim", age: 30 })\` is an error if the parameter type has no \`age\`. Passing a variable holding the same object is not. The check exists to catch typos in literals, not to forbid extra data.

When you really need two identical shapes to be incompatible, such as a UserId and an OrderId that are both strings, add a brand field to tell them apart.`,
          },
          {
            kind: "article",
            title: "Unions and narrowing",
            minutes: 9,
            body: `A union type says a value can be one of several things: \`string | number\`, or \`"pending" | "paid" | "refunded"\`. Unions describe real data honestly, but TypeScript will not let you use a union as if it were only one of its members.

You narrow it first. A \`typeof x === "string"\` check, an \`in\` check, or a comparison against a literal tells the compiler which member you are holding inside that branch.

The most useful pattern is the discriminated union: every member has a shared literal field, usually called \`kind\` or \`status\`. Switching on that field narrows the whole object, so inside \`case "paid"\` you can read \`paidAt\` without a cast.

Add a \`default\` branch that assigns the value to a variable of type \`never\`. If someone later adds a new status, every switch that forgot to handle it becomes a compile error instead of a silent bug.`,
          },
          {
            kind: "article",
            title: "Generics without the fear",
            minutes: 12,
            body: `A generic is a type parameter: a slot the caller fills in. \`function first<T>(items: T[]): T | undefined\` says "give me an array of anything, and I will return one of the same thing". Call it with numbers and you get \`number | undefined\` back, with no cast and no \`any\`.

Most of the time you do not write the angle brackets at the call site. TypeScript infers \`T\` from the arguments.

Constraints keep generics honest. \`<T extends { id: string }>\` accepts any type that has a string id, so the function body can read \`item.id\` safely while still returning the caller's full type.

A good rule: introduce a type parameter only when it links two places, usually an input to an output. If \`T\` appears once, you probably wanted a plain parameter type instead. Generics that connect nothing make signatures harder to read and catch no extra bugs.`,
          },
          {
            kind: "quiz",
            title: "Check: the type system",
            passPct: 70,
            questions: [
              choice(
                "TypeScript's type system is primarily…",
                "Structural",
                ["Nominal", "Dynamic"],
                "Compatibility is decided by shape, not by declared inheritance.",
              ),
              trueFalse(
                "`strict` in tsconfig enables noImplicitAny.",
                true,
                "noImplicitAny is one of the checks the strict flag turns on.",
              ),
              choice(
                "Inside `case \"paid\":` of a switch on a discriminated union's `status`, what can you access?",
                "The fields that only the paid member has",
                ["Only the status field", "Nothing until you cast the value"],
                "Checking the shared literal field narrows the whole object to that member.",
              ),
            ],
          },
        ],
      },
      {
        title: "Working in a real project",
        lessons: [
          {
            kind: "article",
            title: "Strict mode settings that matter",
            minutes: 8,
            body: `\`strict\` is the baseline, but a few settings outside it are worth turning on in new projects.

\`noUncheckedIndexedAccess\` makes \`items[0]\` return \`T | undefined\` instead of \`T\`. It is annoying for a day and then catches exactly the empty-array crash that reaches production.

\`exactOptionalPropertyTypes\` separates "this field may be missing" from "this field may be explicitly undefined". It matters when you send partial updates to an API.

\`noImplicitOverride\` and \`noFallthroughCasesInSwitch\` are cheap and catch mistakes during refactors.

Resist \`skipLibCheck: false\` unless you publish a library; checking every dependency's types slows builds and reports errors you cannot fix. And never silence an error with \`// @ts-ignore\`. Use \`// @ts-expect-error\` with a reason, which fails loudly once the underlying problem is fixed.`,
          },
          {
            kind: "article",
            title: "Typing API responses",
            minutes: 11,
            body: `\`await response.json()\` returns \`any\`, and \`any\` spreads: every value derived from it is unchecked. Writing \`as User\` does not help much, because it only tells the compiler what you hope the server sent.

Validate at the boundary instead. A schema library such as Zod lets you describe the expected shape once, parse the response at runtime, and infer the TypeScript type from the same schema. If the server changes a field, you get a clear error where the data enters your app, not an undefined deep inside a component.

Keep the parsing in one module per API, export the inferred types, and let the rest of the code import types only. That way a change in the API is a change in one file.

For data you control on both ends, share the schema between server and client so both sides agree by construction.`,
          },
        ],
      },
    ],
  },
  {
    slug: "sql-for-analysts",
    title: "SQL for Analysts",
    subtitle: "Query, join, and summarise data without waiting on an engineer.",
    description:
      "A practical SQL course for people who already live in spreadsheets and want the database to do the heavy lifting. You will write queries you can trust, join tables without duplicating rows, and build the summaries your weekly report needs.",
    level: "BEGINNER",
    categorySlug: "data-science",
    priceBdtMinor: 399000,
    priceUsdCents: 3900,
    objectives: [
      "Write SELECT queries you can trust.",
      "Join tables without duplicating rows.",
      "Summarise data with GROUP BY and filter groups with HAVING.",
      "Explain a query result to a colleague who does not read SQL.",
    ],
    requirements: ["You have used a spreadsheet for filtering and simple formulas."],
    audience: [
      "Analysts and operations staff who wait on engineers for data pulls.",
      "Excel users who want to work with data that no longer fits in a sheet.",
    ],
    sections: [
      {
        title: "Getting started",
        lessons: [
          {
            kind: "article",
            title: "Why SQL still matters",
            minutes: 4,
            preview: true,
            body: `Spreadsheets are a great sandbox. SQL is how you ask the same question of a million rows without copying them into memory first.

When the data lives in a database, a query runs next to it. You describe the result you want, which columns, which rows, grouped how, and the database works out how to get it. The answer comes back in seconds and the source data never changes.

SQL has also barely changed in forty years. The query you learn this week will run on PostgreSQL, MySQL, SQL Server, BigQuery and most of the tools your company already pays for, with small differences in date functions and not much else.

The biggest benefit is reproducibility. A query is a written record of exactly how a number was produced. When a manager asks why last month's figure moved, you can rerun it, read it, and show your working.`,
          },
          {
            kind: "article",
            title: "SELECT, FROM, WHERE",
            minutes: 8,
            body: `Every query you write in this course starts with three clauses. \`FROM\` names the table. \`WHERE\` keeps only the rows you care about. \`SELECT\` picks the columns to show. The database reads them in that order, even though you write SELECT first.

\`SELECT name, city FROM customers WHERE city = 'Dhaka'\` returns two columns for every customer in Dhaka. Text values go in single quotes; numbers do not.

Combine conditions with \`AND\` and \`OR\`, and use parentheses whenever you mix them, because \`AND\` binds tighter and the default is rarely what you meant. \`IN ('Dhaka', 'Chattogram')\` is shorter than a chain of ORs.

Missing values are \`NULL\`, and \`NULL\` is not equal to anything, not even itself. Write \`WHERE phone IS NULL\`, never \`= NULL\`. Finally, add \`ORDER BY\` and \`LIMIT 20\` while exploring so you look at a sample before running anything large.`,
          },
          {
            kind: "quiz",
            title: "Check: first queries",
            passPct: 70,
            questions: [
              choice(
                "Which clause keeps only the rows that match a condition?",
                "WHERE",
                ["SELECT", "ORDER BY", "FROM"],
                "WHERE filters rows; SELECT chooses columns.",
              ),
              trueFalse(
                "`WHERE phone = NULL` finds rows with no phone number.",
                false,
                "NULL is never equal to anything. Use IS NULL.",
              ),
              choice(
                "In `a AND b OR c`, what is evaluated first?",
                "a AND b",
                ["b OR c", "They are evaluated left to right with equal priority"],
                "AND binds tighter than OR, so add parentheses when mixing them.",
              ),
            ],
          },
        ],
      },
      {
        title: "Joining and summarising",
        lessons: [
          {
            kind: "article",
            title: "Joins without duplicate rows",
            minutes: 12,
            body: `A join puts rows from two tables side by side where a condition matches, usually an id: \`FROM orders JOIN customers ON customers.id = orders.customer_id\`.

Before you join, ask how many rows on each side can match one row on the other. One customer has many orders, so joining customers to orders returns one row per order, and the customer's details repeat. That is correct. The trouble starts when you then join a second many-side table, such as payments: every order row is now multiplied by its payments, and totals double.

Count rows before and after each join while you build a query. If the count jumps unexpectedly, you have a many-to-many problem. Fix it by summarising one side first, in a subquery or a WITH clause, and then joining the summary.

Use \`LEFT JOIN\` when you need to keep rows with no match, such as customers who never ordered.`,
          },
          {
            kind: "article",
            title: "GROUP BY and HAVING",
            minutes: 10,
            body: `\`GROUP BY\` collapses rows that share a value into one row per group, and aggregate functions summarise each group: \`COUNT(*)\`, \`SUM(amount)\`, \`AVG(amount)\`, \`MIN\`, \`MAX\`.

\`SELECT city, COUNT(*) FROM customers GROUP BY city\` returns one row per city with its customer count. Every column in SELECT must either be in GROUP BY or be inside an aggregate; otherwise the database cannot know which of the group's values to show.

\`WHERE\` filters rows before grouping. \`HAVING\` filters groups after. To find cities with more than 100 customers who signed up this year, put the date condition in WHERE and \`COUNT(*) > 100\` in HAVING.

\`COUNT(column)\` skips NULLs while \`COUNT(*)\` counts rows, a difference that quietly changes percentages. When a number looks off, compare the two before anything else.`,
          },
          {
            kind: "quiz",
            title: "Check: joins",
            passPct: 70,
            questions: [
              trueFalse(
                "Joining orders to payments to customers can double-count order totals.",
                true,
                "Each order row repeats once per matching payment, so sums grow.",
              ),
              choice(
                "Which clause filters groups after aggregation?",
                "HAVING",
                ["WHERE", "GROUP BY", "LIMIT"],
                "WHERE runs before grouping; HAVING runs after.",
              ),
              choice(
                "Which join keeps customers who have no orders?",
                "LEFT JOIN from customers to orders",
                ["INNER JOIN", "A join with WHERE orders.id IS NOT NULL"],
                "A left join keeps every row from the left table, with NULLs where nothing matched.",
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "postgres-for-app-developers",
    title: "Postgres for Application Developers",
    subtitle: "Design tables that stay correct and queries that stay fast.",
    description:
      "For developers who use Postgres through an ORM and want to understand what happens underneath. You will choose keys, let constraints guard your data, read query plans, and add the indexes a real workload needs.",
    level: "INTERMEDIATE",
    categorySlug: "web-development",
    priceBdtMinor: 699000,
    priceUsdCents: 5900,
    objectives: [
      "Choose primary keys and foreign keys deliberately.",
      "Use constraints so invalid data cannot be written.",
      "Read EXPLAIN ANALYZE output and find the slow step.",
      "Add indexes that match how your app queries, and skip the rest.",
    ],
    requirements: [
      "You have built an app that stores data in a SQL database.",
      "Basic SQL: SELECT, JOIN, WHERE.",
    ],
    audience: ["Backend and full-stack developers working with Postgres."],
    sections: [
      {
        title: "Schema design",
        lessons: [
          {
            kind: "article",
            title: "Choosing keys",
            minutes: 9,
            preview: true,
            body: `Every table needs a primary key: a column, or set of columns, that identifies one row and never changes. Use a surrogate key, a generated id with no business meaning, rather than an email address or a phone number. People change those, and updating a primary key means updating every table that points to it.

Between auto-incrementing integers and UUIDs, the practical difference is exposure and ordering. Sequential integers reveal how many orders you have and are easy to guess in URLs. Random UUIDs hide that but scatter inserts across the index. UUID version 7 is a good middle ground: it is unguessable enough for URLs and sorts by creation time, so inserts stay cheap.

Natural uniqueness still matters. Keep the surrogate key and add a UNIQUE constraint on the email, so the database, not your application code, stops duplicates.`,
          },
          {
            kind: "article",
            title: "Constraints as documentation",
            minutes: 8,
            body: `A constraint is a rule the database enforces on every write, from every client, forever. Your application validation runs only in the code path that remembers to call it.

\`NOT NULL\` states that a value is required. \`CHECK (amount > 0)\` rejects impossible values. \`UNIQUE\` stops duplicates even when two requests race. Foreign keys guarantee that an order's customer exists, and \`ON DELETE\` says what happens when it no longer does: \`CASCADE\`, \`RESTRICT\`, or \`SET NULL\`. Choose each one on purpose.

Partial unique indexes express rules like "at most one active price per course per currency" that a plain UNIQUE cannot.

Constraints also document the schema. A new developer reading the table definition learns the business rules without searching the codebase. When a rule changes, change the constraint in a migration, and the database tells you immediately which existing rows break it.`,
          },
          {
            kind: "quiz",
            title: "Check: schema design",
            passPct: 70,
            questions: [
              trueFalse(
                "An email address makes a good primary key because it is already unique.",
                false,
                "Emails change. Use a surrogate key and a UNIQUE constraint on the email.",
              ),
              choice(
                "Which rule enforces 'amount must be positive' for every client that writes to the table?",
                "CHECK (amount > 0)",
                ["Validation in the API handler", "A comment on the column"],
                "Only a constraint applies to every write, whatever code path produced it.",
              ),
              choice(
                "Which UUID version sorts by creation time?",
                "Version 7",
                ["Version 4", "Version 1 with a random node"],
                "UUIDv7 starts with a timestamp, so new ids land at the end of the index.",
              ),
            ],
          },
        ],
      },
      {
        title: "Performance",
        lessons: [
          {
            kind: "article",
            title: "Reading EXPLAIN",
            minutes: 14,
            body: `\`EXPLAIN\` shows the plan Postgres intends to use for a query. \`EXPLAIN ANALYZE\` runs the query and shows what actually happened, with real row counts and timings. Use ANALYZE, and wrap writes in a transaction you roll back.

Read the plan from the most indented line outwards. Each node reports estimated rows and actual rows. When the two differ by a factor of ten or more, the planner is working from bad statistics and probably chose the wrong strategy; run \`ANALYZE tablename\` and look again.

Look for a Seq Scan on a large table feeding a filter that keeps a handful of rows. That is where an index helps. A Nested Loop over thousands of outer rows is another warning sign.

Measure before and after every change. A plan that looks worse on paper can be faster on your data, and the only honest judge is the actual time line at the bottom.`,
          },
          {
            kind: "article",
            title: "Indexes you actually need",
            minutes: 11,
            body: `An index speeds up reads that filter or sort on its columns and slows every insert and update a little. Add indexes for the queries your app runs often, not for every column.

Start with foreign keys: Postgres does not index them automatically, and joins and cascading deletes on unindexed foreign keys are a common cause of slow pages.

A composite index on \`(course_id, created_at)\` serves "this course's reviews, newest first" in one step. Column order matters: the index helps queries that filter on the leading column. It does little for queries that filter only on created_at.

Partial indexes such as \`WHERE status = 'PUBLISHED'\` stay small when most rows are excluded. For text search, use a generated tsvector column with a GIN index rather than \`LIKE '%word%'\`.

Every few months, check \`pg_stat_user_indexes\` for indexes that are never used and drop them.`,
          },
          {
            kind: "quiz",
            title: "Check: performance",
            passPct: 70,
            questions: [
              trueFalse(
                "Postgres creates an index on every foreign key column automatically.",
                false,
                "It indexes primary keys and unique constraints, not foreign keys.",
              ),
              choice(
                "Estimated rows 12, actual rows 48,000. What is the likely cause?",
                "Stale or missing statistics",
                ["Too many indexes", "The query uses a JOIN"],
                "Big estimate errors mean the planner is guessing. Run ANALYZE.",
              ),
              choice(
                "An index on (course_id, created_at) helps most with which query?",
                "WHERE course_id = $1 ORDER BY created_at DESC",
                ["WHERE created_at > now() - interval '1 day'", "ORDER BY title"],
                "Composite indexes serve queries that use the leading column.",
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "excel-for-business-reporting",
    title: "Excel for Business Reporting",
    subtitle: "Turn messy exports into a monthly report a manager reads in minutes.",
    description:
      "Learn the Excel habits that make reports reliable: clean tables, consistent dates, PivotTables for summaries, and charts that answer one question each. Built around the kind of sales and expense exports most offices deal with.",
    level: "BEGINNER",
    categorySlug: "office-productivity",
    priceBdtMinor: 299000,
    priceUsdCents: 2900,
    objectives: [
      "Convert raw exports into Excel tables that update cleanly.",
      "Fix dates and numbers stored as text.",
      "Summarise sales by month, region and product with a PivotTable.",
      "Choose a chart that answers one question clearly.",
    ],
    requirements: ["Excel 2016 or later, or Microsoft 365, on Windows or Mac."],
    audience: [
      "Office staff who prepare weekly or monthly reports.",
      "Small business owners tracking sales and expenses.",
    ],
    sections: [
      {
        title: "Clean data",
        lessons: [
          {
            kind: "article",
            title: "Tables, not ranges",
            minutes: 6,
            preview: true,
            body: `Most report problems start with data pasted into a plain range of cells. Formulas point at \`A2:A500\`, next month's export has 612 rows, and the total quietly misses the last 112.

Select any cell in your data and press Ctrl+T to turn it into an Excel table. Give it a name on the Table Design tab, such as \`Sales\`. From now on formulas can say \`=SUM(Sales[Amount])\`, which reads like English and always covers every row, however many you paste in.

Tables also keep formatting consistent, fill formulas down automatically when you add a column, and feed PivotTables and charts that grow with the data.

Keep one table per sheet, one header row, and no blank rows or merged cells inside it. Put notes and totals somewhere else. That discipline is most of the difference between a report you rebuild every month and one you refresh.`,
          },
          {
            kind: "article",
            title: "Fixing dates and text",
            minutes: 9,
            body: `Exports from accounting and sales systems often store numbers and dates as text. You can spot them: they sit on the left of the cell, SUM ignores them, and filters list "01/02/2026" in the wrong order.

For numbers, select the column and use Data › Text to Columns › Finish. It is the quickest way to make Excel re-read the values. \`=VALUE(A2)\` works in a helper column too.

Dates need more care because 01/02/2026 means 1 February in Bangladesh and 2 January in the United States. In Text to Columns, choose Date and pick the order the file actually uses, DMY for most local systems. Then check a date whose day is above 12, which cannot be ambiguous.

Remove stray spaces with \`=TRIM()\` before matching names, and standardise spellings like "Ctg" and "Chattogram" with Find and Replace, or your PivotTable will show them as different places.`,
          },
          {
            kind: "quiz",
            title: "Check: clean data",
            passPct: 70,
            questions: [
              choice(
                "Why use =SUM(Sales[Amount]) instead of =SUM(C2:C500)?",
                "It covers every row of the table as the data grows",
                ["It calculates faster", "It rounds amounts automatically"],
                "Structured references expand with the table.",
              ),
              trueFalse(
                "A number aligned to the left of its cell is probably stored as text.",
                true,
                "Excel right-aligns real numbers by default.",
              ),
              choice(
                "How do you check a date column was converted in the right order?",
                "Look at a date whose day is greater than 12",
                ["Sort the column", "Change the cell format to General"],
                "Day 13 or later can only be read one way.",
              ),
            ],
          },
        ],
      },
      {
        title: "Reports",
        lessons: [
          {
            kind: "article",
            title: "PivotTables",
            minutes: 12,
            body: `A PivotTable summarises a table without a single formula. Click inside your Sales table and choose Insert › PivotTable › New Worksheet.

Drag Region into Rows, Month into Columns and Amount into Values. You now have total sales by region and month. Drag Product under Region to break each region down further, or into Filters to look at one product at a time.

Values summarise with Sum by default. Change it to Count or Average under Value Field Settings, and use Show Values As › % of Row Total to see each month's share.

When next month's export arrives, paste it into the table and press Refresh on the PivotTable Analyze tab. Because the source is a table, the new rows are included automatically.

Add Slicers for Region or Product. They are big, clickable filters that make the report usable by someone who has never touched a PivotTable.`,
          },
          {
            kind: "article",
            title: "Charts a manager reads in ten seconds",
            minutes: 8,
            body: `A good report chart answers one question, and its title says the answer: "Chattogram sales fell 12% in August", not "Sales by region".

Pick the chart from the question. Change over time is a line chart with months along the bottom. Comparing a few categories is a bar chart sorted from largest to smallest. Part of a whole is usually clearer as a sorted bar chart than as a pie, because people compare lengths far better than angles.

Remove what does not help: gridlines, 3D effects, legends when there is one series, and decimal places nobody reads. Label the key bars directly instead of making readers match colours to a legend.

Use one strong colour for the thing you want noticed and grey for everything else. If you need a second chart to explain the first, the first one is trying to answer too many questions.`,
          },
          {
            kind: "quiz",
            title: "Check: reports",
            passPct: 70,
            questions: [
              choice(
                "Which chart suits monthly revenue over a year?",
                "Line chart",
                ["Pie chart", "Scatter plot"],
                "Change over time reads best as a line.",
              ),
              trueFalse(
                "After pasting new rows into the source table, a PivotTable updates when you press Refresh.",
                true,
                "Tables expand, and Refresh picks up the new rows.",
              ),
              choice(
                "What makes a better chart title?",
                "Chattogram sales fell 12% in August",
                ["Sales by region", "Chart 3"],
                "A title that states the answer tells the reader what to see.",
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "spoken-english-for-interviews",
    title: "Spoken English for Job Interviews",
    subtitle: "Answer clearly and confidently, even when the question surprises you.",
    description:
      "A practical course for Bangladeshi graduates and professionals preparing for interviews in English. You will build a two-minute introduction, structure answers so they stay on track, recover from questions you did not expect, and close the interview well.",
    level: "ALL_LEVELS",
    categorySlug: "career-skills",
    priceBdtMinor: 199000,
    priceUsdCents: 1900,
    objectives: [
      "Introduce yourself in two minutes without memorising a script.",
      "Structure answers with situation, action and result.",
      "Buy thinking time politely when a question surprises you.",
      "Ask questions at the end that show you prepared.",
    ],
    requirements: ["You can read and understand everyday English."],
    audience: [
      "Final-year students and recent graduates.",
      "Professionals applying to multinational or remote roles.",
    ],
    sections: [
      {
        title: "Before the interview",
        lessons: [
          {
            kind: "article",
            title: "Telling your story in two minutes",
            minutes: 7,
            preview: true,
            body: `Interviewers remember a clear story, not perfect grammar. Your introduction should explain who you are professionally, what you have done that matters for this role, and why you want this job, in about two minutes.

Build it in three parts. Present: your current role or studies, in one sentence. Past: two achievements with a number or a result, such as "I reduced invoice errors by a third" or "our team project won the university case competition". Future: why this company and this role are the next step.

Do not memorise it word for word. Memorised answers sound flat, and one forgotten word can make you lose the whole thing. Memorise the three parts and the two achievements, then say it differently each time you practise.

Record yourself on your phone. Listen for speed first: most nervous speakers go too fast. Slow down, and pause after each achievement so it lands.`,
          },
          {
            kind: "article",
            title: "Answering \"tell me about yourself\"",
            minutes: 8,
            body: `"Tell me about yourself" is not a request for your life story. It is the interviewer asking why they should keep listening. Answer with the two-minute story from the previous lesson, adjusted to the job description in front of them.

Read the posting before the interview and underline the three skills it mentions most. Make sure each one appears in your answer with an example. If the role asks for teamwork, your achievement should involve other people.

Avoid starting with your hometown, your parents' jobs, or your school results unless they relate directly to the role. Avoid negative words about a previous employer. Even a fair complaint makes the listener wonder what you will say about them.

End with a sentence that hands the conversation back: "That's why I'm excited about this role, and I'd be happy to go into more detail on any of that." It shows confidence and gives them an easy next question.`,
          },
          {
            kind: "quiz",
            title: "Check: introductions",
            passPct: 70,
            questions: [
              choice(
                "What is the best structure for a two-minute introduction?",
                "Present, past achievements, future goal",
                ["Childhood, school, university", "A list of every job you have had"],
                "Present, past, future keeps it relevant and short.",
              ),
              trueFalse(
                "You should memorise your introduction word for word.",
                false,
                "Memorise the points, not the sentences, so it sounds natural and survives a slip.",
              ),
              choice(
                "Where should the skills in your answer come from?",
                "The job description",
                ["Your favourite subjects", "Popular interview websites"],
                "Match your examples to what this employer asked for.",
              ),
            ],
          },
        ],
      },
      {
        title: "In the room",
        lessons: [
          {
            kind: "article",
            title: "Handling questions you did not expect",
            minutes: 9,
            body: `Every interview has a question you did not prepare for. Interviewers care less about a perfect answer than about how you think under a little pressure.

First, buy time politely. "That's a good question, let me think for a moment" is completely normal in English interviews. So is repeating the question back: "So you're asking how I would handle a client who keeps changing requirements?" It confirms you understood and gives you a few seconds.

Then use a structure so your answer does not wander. For experience questions, use situation, action, result: what was happening, what you did, and what changed because of it. For hypothetical questions, say what you would do first, what you would check, and how you would know it worked.

If you truly do not know, say so and show how you would find out. "I haven't used that tool, but I learned a similar one in two weeks by…" is a strong answer.`,
          },
          {
            kind: "article",
            title: "Asking good questions at the end",
            minutes: 6,
            body: `"Do you have any questions for us?" is part of the interview, and "No, thank you" wastes it. Prepare three questions and ask one or two, depending on time.

Good questions show you listened and that you are imagining yourself in the job. Ask what success looks like in the first three months, what the team is working on right now, or what the biggest challenge in the role is. Ask the interviewer what they enjoy about working there; people answer that one warmly.

Avoid asking about salary, leave or working hours in a first interview unless they raise it. Those questions are fair, but they are better asked once an offer is close.

Finish by thanking them and restating your interest in one sentence. Within a day, send a short email that thanks them and mentions one specific thing you discussed, so they remember which candidate you were.`,
          },
          {
            kind: "quiz",
            title: "Check: in the room",
            passPct: 70,
            questions: [
              trueFalse(
                "Asking for a moment to think is acceptable in an English-language interview.",
                true,
                "It is normal and reads as thoughtful, not weak.",
              ),
              choice(
                "Which answer structure suits 'Tell me about a time you solved a problem'?",
                "Situation, action, result",
                ["Opinion, fact, opinion", "Start with your weaknesses"],
                "It keeps experience answers focused and shows the outcome.",
              ),
              choice(
                "Which is the strongest question to ask at the end of a first interview?",
                "What does success look like in the first three months?",
                ["How many days of leave do I get?", "No questions, thank you"],
                "It shows you are already thinking about doing the job well.",
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "python-basics",
    title: "Python Basics",
    subtitle: "Write small programs that do real work, from your first script to reading a CSV.",
    description:
      "An unhurried first programming course. You will install Python, understand variables and types, use lists and loops, and finish by reading a real CSV file and summarising it, a task that saves hours of manual spreadsheet work.",
    level: "BEGINNER",
    categorySlug: "data-science",
    priceBdtMinor: 449000,
    priceUsdCents: 3900,
    objectives: [
      "Install Python and run a script from the terminal.",
      "Use variables, strings, numbers and booleans correctly.",
      "Loop over lists and make decisions with if statements.",
      "Read a CSV file and calculate totals from it.",
    ],
    requirements: ["A Windows, Mac or Linux computer you can install software on."],
    audience: [
      "Complete beginners who want to start programming.",
      "Office workers who want to automate repetitive data tasks.",
    ],
    sections: [
      {
        title: "First steps",
        lessons: [
          {
            kind: "article",
            title: "Installing Python and running a script",
            minutes: 6,
            preview: true,
            body: `Download Python from python.org and run the installer. On Windows, tick "Add python.exe to PATH" on the first screen. It is the one setting that causes most beginner problems when it is missed.

Open a terminal (Command Prompt or PowerShell on Windows, Terminal on Mac) and type \`python --version\`. On some Macs the command is \`python3\`. If you see a version number, Python is ready.

Create a folder for this course and a file inside it called \`hello.py\`, using a code editor such as VS Code. Type \`print("Hello from Python")\`, save it, and in the terminal, from that folder, run \`python hello.py\`.

That is the loop you will repeat for the rest of the course: edit a file, save, run, read the output. When something goes wrong, read the last line of the error first. It usually names the problem and the line number.`,
          },
          {
            kind: "article",
            title: "Variables and types",
            minutes: 8,
            body: `A variable is a name for a value: \`price = 450\`. From then on, \`price\` means 450 until you assign something else. Choose names that say what the value is. \`total_price\` is better than \`tp\`.

Every value has a type. \`450\` is an int, a whole number. \`450.5\` is a float. \`"Dhaka"\` is a str, text in quotes. \`True\` and \`False\` are bools. \`type(price)\` tells you which one you have.

Types decide what operations mean. \`2 + 3\` is 5, but \`"2" + "3"\` is "23", because adding strings joins them. \`"2" + 3\` is an error: Python refuses to guess. Convert explicitly with \`int("2")\` or \`str(3)\`.

\`input()\` always returns a string, even when the user types a number, so wrap it: \`age = int(input("Age: "))\`. Many beginner bugs come from a number that is secretly text, the same problem you will meet again in CSV files.`,
          },
          {
            kind: "quiz",
            title: "Check: first steps",
            passPct: 70,
            questions: [
              choice(
                "What does `\"2\" + \"3\"` produce in Python?",
                "\"23\"",
                ["5", "An error"],
                "Adding strings joins them.",
              ),
              trueFalse(
                "`input()` returns a number when the user types digits.",
                false,
                "input() always returns a string. Convert it with int() or float().",
              ),
              choice(
                "Which part of an error message should you read first?",
                "The last line",
                ["The first line", "The file path"],
                "The last line names the error; the lines above show where it happened.",
              ),
            ],
          },
        ],
      },
      {
        title: "Doing real work",
        lessons: [
          {
            kind: "article",
            title: "Lists and loops",
            minutes: 10,
            body: `A list holds several values in order: \`prices = [450, 1200, 300]\`. \`prices[0]\` is the first item, because Python counts from zero, and \`len(prices)\` is how many there are. \`prices.append(800)\` adds one to the end.

A \`for\` loop runs the same code once per item:

\`for price in prices:\` followed by an indented \`print(price)\`. The indentation is not decoration; it tells Python which lines belong inside the loop. Use four spaces, consistently.

Combine loops with \`if\` to make decisions: inside the loop, \`if price > 1000:\` then an indented \`print("Large order:", price)\`. Add \`elif\` and \`else\` for other cases.

To build a total, start a variable at zero before the loop and add to it inside: \`total = 0\`, then \`total = total + price\` in the loop. Print the total after the loop, not in it. That small pattern, start, accumulate, report, is behind most of the data work you will do.`,
          },
          {
            kind: "article",
            title: "Reading a CSV file",
            minutes: 11,
            body: `CSV files are how most systems export data, and Python reads them with the built-in \`csv\` module.

\`import csv\`, then open the file with \`with open("sales.csv", newline="", encoding="utf-8") as f:\` and create \`reader = csv.DictReader(f)\`. Each row comes back as a dictionary keyed by the header, so \`row["amount"]\` reads the amount column by name instead of by position.

Remember the lesson on types: every value from a CSV is a string. Convert before doing arithmetic: \`amount = float(row["amount"])\`.

To total sales per region, use a dictionary: start with \`totals = {}\`, and in the loop write \`totals[region] = totals.get(region, 0) + amount\`. After the loop, print each region and its total.

This script replaces copying, filtering and summing by hand, and it gives the same answer every time you run it. When next month's file arrives, you change one file name.`,
          },
          {
            kind: "quiz",
            title: "Check: real work",
            passPct: 70,
            questions: [
              choice(
                "What is `prices[0]` for `prices = [450, 1200, 300]`?",
                "450",
                ["1200", "An error, lists start at 1"],
                "Python counts positions from zero.",
              ),
              trueFalse(
                "Values read with csv.DictReader are already numbers when the column contains digits.",
                false,
                "Every CSV value is a string until you convert it.",
              ),
              choice(
                "Where should you print a running total?",
                "After the loop finishes",
                ["Inside the loop on every item", "Before the loop starts"],
                "Accumulate inside the loop, report once after it.",
              ),
            ],
          },
        ],
      },
    ],
  },
];

export const SEED_LEARNERS: SeedLearner[] = [
  {
    name: "Nusrat Jahan",
    email: "nusrat.jahan@example.com",
    reviews: [
      {
        courseSlug: "typescript-foundations",
        rating: 5,
        body: "The lesson on discriminated unions finally made narrowing click for me. I refactored our order status code the same week.",
      },
      {
        courseSlug: "sql-for-analysts",
        rating: 5,
        body: "Counting rows before and after each join saved me from a double-counted revenue report. Short lessons, no filler.",
      },
    ],
  },
  {
    name: "Tanvir Ahmed",
    email: "tanvir.ahmed@example.com",
    reviews: [
      {
        courseSlug: "typescript-foundations",
        rating: 4,
        body: "Clear and practical. I wanted a longer section on generics, but the API response lesson was worth the price alone.",
      },
      {
        courseSlug: "postgres-for-app-developers",
        rating: 5,
        body: "We had no index on two foreign keys. Adding them took our slowest page from four seconds to under half a second.",
      },
    ],
  },
  {
    name: "Farhana Akter",
    email: "farhana.akter@example.com",
    reviews: [
      {
        courseSlug: "excel-for-business-reporting",
        rating: 5,
        body: "Converting our exports into tables means the monthly report refreshes instead of being rebuilt. My manager noticed.",
      },
      {
        courseSlug: "spoken-english-for-interviews",
        rating: 4,
        body: "The present, past, future structure helped me stop rambling. I would like more example answers to listen to.",
      },
    ],
  },
  {
    name: "Rakib Hasan",
    email: "rakib.hasan@example.com",
    reviews: [
      {
        courseSlug: "python-basics",
        rating: 5,
        body: "I had never programmed before. By the last lesson I had a script totalling our shop's sales by branch from the CSV export.",
      },
      {
        courseSlug: "sql-for-analysts",
        rating: 3,
        body: "Good explanations of joins and GROUP BY, but I expected window functions too. Fine as a first course, not beyond that.",
      },
    ],
  },
  {
    name: "Sadia Islam",
    email: "sadia.islam@example.com",
    reviews: [
      {
        courseSlug: "spoken-english-for-interviews",
        rating: 5,
        body: "Asking for a moment to think felt rude to me before this course. In my last interview it gave me time to answer properly.",
      },
      {
        courseSlug: "excel-for-business-reporting",
        rating: 4,
        body: "The date lesson fixed a DMY and MDY mix-up that had been breaking our reports for months. Charts lesson is short but useful.",
      },
    ],
  },
  {
    name: "Imran Hossain",
    email: "imran.hossain@example.com",
    reviews: [
      {
        courseSlug: "postgres-for-app-developers",
        rating: 4,
        body: "Reading EXPLAIN ANALYZE was the lesson I needed. The constraints section changed how I write migrations.",
      },
      {
        courseSlug: "python-basics",
        rating: 4,
        body: "Patient and well ordered. The note about input returning a string saved me from a bug on day one.",
      },
    ],
  },
];
