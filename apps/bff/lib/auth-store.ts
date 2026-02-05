import { createHash, randomBytes, randomUUID, scryptSync } from 'crypto';

import 'server-only';

import { getDb } from './db';

export type StoredUser = {
  id: string;
  email: string;
  role: string;
  engagementIds: string[];
  name?: string | null;
  vis?: unknown;
  passwordHash?: string | null;
  status: 'active' | 'invited' | 'disabled';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
};

export type InviteType = 'magic' | 'temp_password';

export type InviteRecord = {
  id: string;
  email: string;
  role: string;
  engagementIds: string[];
  name?: string | null;
  vis?: unknown;
  type: InviteType;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
  createdBy?: string | null;
  metadata?: Record<string, unknown> | null;
};

const db = getDb();

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const now = () => new Date().toISOString();

const toJson = (value: unknown) => JSON.stringify(value ?? null);
const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

const scryptHash = (password: string) => {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
};

const mapUser = (row: Record<string, unknown>): StoredUser => {
  return {
    id: String(row.id),
    email: String(row.email),
    role: String(row.role),
    engagementIds: parseJson<string[]>(String(row.engagement_ids ?? '[]'), []),
    name: row.name ? String(row.name) : null,
    vis: parseJson<unknown>(row.vis ? String(row.vis) : null, null),
    passwordHash: row.password_hash ? String(row.password_hash) : null,
    status: (row.status as StoredUser['status']) ?? 'invited',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
};

const mapInvite = (row: Record<string, unknown>): InviteRecord => {
  return {
    id: String(row.id),
    email: String(row.email),
    role: String(row.role),
    engagementIds: parseJson<string[]>(String(row.engagement_ids ?? '[]'), []),
    name: row.name ? String(row.name) : null,
    vis: parseJson<unknown>(row.vis ? String(row.vis) : null, null),
    type: (row.type as InviteType) ?? 'magic',
    expiresAt: String(row.expires_at),
    usedAt: row.used_at ? String(row.used_at) : null,
    createdAt: String(row.created_at),
    createdBy: row.created_by ? String(row.created_by) : null,
    metadata: parseJson<Record<string, unknown> | null>(
      row.metadata ? String(row.metadata) : null,
      null,
    ),
  };
};

export const getUserByEmail = (email: string): StoredUser | null => {
  const row = db
    .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .get(normalizeEmail(email)) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
};

export const upsertUser = (payload: {
  email: string;
  role: string;
  engagementIds: string[];
  name?: string | null;
  vis?: unknown;
  passwordHash?: string | null;
  status?: StoredUser['status'];
}): StoredUser => {
  const email = normalizeEmail(payload.email);
  const existing = getUserByEmail(email);
  const timestamp = now();
  const engagementIds = Array.from(new Set(payload.engagementIds)).sort();

  if (!existing) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO users
        (id, email, role, engagement_ids, name, vis, password_hash, status, created_at, updated_at)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      email,
      payload.role,
      toJson(engagementIds),
      payload.name ?? null,
      toJson(payload.vis ?? null),
      payload.passwordHash ?? null,
      payload.status ?? 'active',
      timestamp,
      timestamp,
    );
    return mapUser(
      db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>,
    );
  }

  db.prepare(
    `UPDATE users
     SET role = ?, engagement_ids = ?, name = ?, vis = ?, password_hash = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    payload.role ?? existing.role,
    toJson(engagementIds.length ? engagementIds : existing.engagementIds),
    payload.name ?? existing.name ?? null,
    toJson(payload.vis ?? existing.vis ?? null),
    payload.passwordHash ?? existing.passwordHash ?? null,
    payload.status ?? existing.status,
    timestamp,
    existing.id,
  );

  return mapUser(
    db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id) as Record<string, unknown>,
  );
};

export const updateUserLastLogin = (userId: string) => {
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(
    now(),
    now(),
    userId,
  );
};

export const createInvite = (payload: {
  email: string;
  role: string;
  engagementIds: string[];
  name?: string | null;
  vis?: unknown;
  type?: InviteType;
  expiresInHours?: number;
  createdBy?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const inviteId = randomUUID();
  const createdAt = now();
  const expiresIn =
    payload.expiresInHours && payload.expiresInHours > 0 ? payload.expiresInHours : 72;
  const expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000).toISOString();
  const engagementIds = Array.from(new Set(payload.engagementIds)).sort();
  const type = payload.type ?? 'magic';

  let tempPassword: string | null = null;
  let passwordHash: string | null = null;

  if (type === 'temp_password') {
    tempPassword = randomBytes(12).toString('base64url');
    passwordHash = scryptHash(tempPassword);
  }

  db.prepare(
    `INSERT INTO invites
      (id, email, role, engagement_ids, name, vis, token_hash, type, expires_at, created_at, created_by, metadata)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    inviteId,
    normalizeEmail(payload.email),
    payload.role,
    toJson(engagementIds),
    payload.name ?? null,
    toJson(payload.vis ?? null),
    tokenHash,
    type,
    expiresAt,
    createdAt,
    payload.createdBy ?? null,
    toJson(payload.metadata ?? null),
  );

  if (tempPassword) {
    upsertUser({
      email: payload.email,
      role: payload.role,
      engagementIds,
      name: payload.name ?? null,
      vis: payload.vis ?? null,
      passwordHash,
      status: 'active',
    });
  }

  return {
    invite: mapInvite(
      db.prepare('SELECT * FROM invites WHERE id = ?').get(inviteId) as Record<string, unknown>,
    ),
    token,
    tempPassword,
  };
};

export const consumeInviteToken = (token: string) => {
  const tokenHash = hashToken(token);
  const row = db.prepare('SELECT * FROM invites WHERE token_hash = ? LIMIT 1').get(tokenHash) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  const invite = mapInvite(row);
  if (invite.usedAt) return null;
  if (Date.parse(invite.expiresAt) <= Date.now()) return null;

  db.prepare('UPDATE invites SET used_at = ? WHERE id = ?').run(now(), invite.id);

  const user = upsertUser({
    email: invite.email,
    role: invite.role,
    engagementIds: invite.engagementIds,
    name: invite.name ?? null,
    vis: invite.vis ?? null,
    status: 'active',
  });

  return { invite, user };
};
