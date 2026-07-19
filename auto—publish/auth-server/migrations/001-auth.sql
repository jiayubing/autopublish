CREATE TABLE users (
  id TEXT PRIMARY KEY,
  login_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE entitlements (
  user_id TEXT NOT NULL,
  product TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  PRIMARY KEY (user_id, product)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  access_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  access_expires_at TEXT NOT NULL,
  refresh_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  event_code TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL
);
