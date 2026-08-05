import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { dataDir } from "./paths.js";
import { runMigrations } from "./migrations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const dbPath = path.join(dataDir, "scheduler.db");

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);
runMigrations(db);

const TAB_COLORS = ["#0F766E", "#B45309", "#6D28D9", "#BE123C", "#1D4ED8", "#166534"];

// Seed a first business on a brand-new database, matching the prototype's defaultState().
const businessCount = db.prepare("SELECT COUNT(*) AS n FROM businesses").get().n;
if (businessCount === 0) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO businesses (id, name, color, sort_order) VALUES (?, ?, ?, ?)"
  ).run(id, "Business 1", TAB_COLORS[0], 0);
  db.prepare(
    "INSERT INTO business_profiles (business_id) VALUES (?)"
  ).run(id);
}

export { TAB_COLORS, randomUUID };
