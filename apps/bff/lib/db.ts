import { mkdirSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';

import Database from 'better-sqlite3';

import 'server-only';

const DEFAULT_DB_PATH = './data/lucien-auth.sqlite';

const resolveDbPath = (value?: string) => {
  const raw = (value ?? DEFAULT_DB_PATH).trim();
  if (!raw) return resolve(process.cwd(), DEFAULT_DB_PATH);
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
};

const dbPath = resolveDbPath(process.env.AUTH_DB_PATH);
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    engagement_ids TEXT NOT NULL,
    name TEXT,
    vis TEXT,
    password_hash TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    engagement_ids TEXT NOT NULL,
    name TEXT,
    vis TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT,
    metadata TEXT
  );
`);

export const getDb = () => db;
