/**
 * Import immediately after "dotenv/config" and before anything that imports
 * lib/db — ES modules evaluate in import order, and lib/db reads DATABASE_URL
 * when it is first evaluated.
 */
import { testDatabaseUrl } from "../lib/test-database";

process.env.DATABASE_URL = testDatabaseUrl();
