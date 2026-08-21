PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS device_preferences (
  device_id TEXT PRIMARY KEY,
  gauge_id TEXT NOT NULL DEFAULT 'SPEYER',
  threshold_cm INTEGER,
  source_tankstellen INTEGER NOT NULL DEFAULT 1 CHECK (source_tankstellen IN (0, 1)),
  source_nfb INTEGER NOT NULL DEFAULT 1 CHECK (source_nfb IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  gauge_id TEXT NOT NULL DEFAULT 'SPEYER',
  threshold_cm INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device_id
  ON push_subscriptions(device_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_gauge_id
  ON push_subscriptions(gauge_id);
