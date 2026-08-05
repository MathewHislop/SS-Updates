// Lightweight migration runner for existing databases. schema.sql (CREATE TABLE
// IF NOT EXISTS) already gives brand-new installs the full current shape, but a
// database from an earlier version — picked up automatically by the
// auto-updater — needs its existing tables actually altered. Tracked via
// SQLite's built-in PRAGMA user_version so each migration runs at most once.

function hasColumn(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function addColumnIfMissing(db, table, column, definition) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Each migration's `up` must be safe to run against a fresh database too
// (defense in depth alongside schema.sql already having the current shape).
const migrations = [
  {
    version: 1,
    description: "appointment time/duration + customer pricing",
    up(db) {
      addColumnIfMissing(db, "jobs", "start_time", "TEXT NOT NULL DEFAULT '09:00'");
      addColumnIfMissing(db, "jobs", "duration_minutes", "INTEGER NOT NULL DEFAULT 60");
      addColumnIfMissing(db, "customers", "pricing_note", "TEXT NOT NULL DEFAULT ''");
      db.exec(`
        CREATE TABLE IF NOT EXISTS customer_pricing_overrides (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          service_label TEXT NOT NULL,
          price REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_pricing_overrides_customer ON customer_pricing_overrides(customer_id);
      `);
    },
  },
];

export function runMigrations(db) {
  const currentVersion = db.prepare("PRAGMA user_version").get().user_version;
  const pending = migrations.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    migration.up(db);
    db.exec(`PRAGMA user_version = ${migration.version}`);
  }
}
