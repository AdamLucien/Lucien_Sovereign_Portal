import { pbkdf2Hash, randomId, sha256Hex, toBase64Url } from './crypto';

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

export const hashPassword = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2Hash(password, salt);
  return `pbkdf2$150000$${toBase64Url(salt)}$${toBase64Url(derived)}`;
};

export const verifyPassword = async (password: string, passwordHash: string | null | undefined) => {
  if (!passwordHash) return false;
  const trimmed = passwordHash.trim();
  if (!trimmed.startsWith('pbkdf2$')) return false;
  const parts = trimmed.split('$');
  if (parts.length !== 4) return false;
  const [, iterRaw, saltB64, hashB64] = parts;
  const iterations = Number.parseInt(iterRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = Uint8Array.from(atob(saltB64.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
  const expected = Uint8Array.from(atob(hashB64.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
  const derived = await pbkdf2Hash(password, salt, iterations);
  if (derived.length !== expected.length) return false;
  return derived.every((value, index) => value === expected[index]);
};

const mapUser = (row: Record<string, unknown>): StoredUser => ({
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
});

const mapInvite = (row: Record<string, unknown>): InviteRecord => ({
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
});

export const getUserByEmail = async (db: D1Database, email: string) => {
  const row = (await db
    .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .bind(normalizeEmail(email))
    .first()) as Record<string, unknown> | null;
  return row ? mapUser(row) : null;
};

export const upsertUser = async (
  db: D1Database,
  payload: {
    email: string;
    role: string;
    engagementIds: string[];
    name?: string | null;
    vis?: unknown;
    passwordHash?: string | null;
    status?: StoredUser['status'];
  },
) => {
  const email = normalizeEmail(payload.email);
  const existing = await getUserByEmail(db, email);
  const timestamp = now();
  const engagementIds = Array.from(new Set(payload.engagementIds)).sort();

  if (!existing) {
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO users
          (id, email, role, engagement_ids, name, vis, password_hash, status, created_at, updated_at)
         VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
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
      )
      .run();
    return (await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()) as StoredUser;
  }

  await db
    .prepare(
      `UPDATE users
       SET role = ?, engagement_ids = ?, name = ?, vis = ?, password_hash = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      payload.role ?? existing.role,
      toJson(engagementIds.length ? engagementIds : existing.engagementIds),
      payload.name ?? existing.name ?? null,
      toJson(payload.vis ?? existing.vis ?? null),
      payload.passwordHash ?? existing.passwordHash ?? null,
      payload.status ?? existing.status,
      timestamp,
      existing.id,
    )
    .run();

  const refreshed = await db.prepare('SELECT * FROM users WHERE id = ?').bind(existing.id).first();
  return mapUser(refreshed as Record<string, unknown>);
};

export const updateUserLastLogin = async (db: D1Database, userId: string) => {
  await db
    .prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .bind(now(), now(), userId)
    .run();
};

export const createInvite = async (
  db: D1Database,
  payload: {
    email: string;
    role: string;
    engagementIds: string[];
    name?: string | null;
    vis?: unknown;
    type?: InviteType;
    expiresInHours?: number;
    createdBy?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) => {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(tokenBytes);
  const tokenHash = await sha256Hex(token);
  const inviteId = randomId();
  const createdAt = now();
  const expiresIn =
    payload.expiresInHours && payload.expiresInHours > 0 ? payload.expiresInHours : 72;
  const expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000).toISOString();
  const engagementIds = Array.from(new Set(payload.engagementIds)).sort();
  const type = payload.type ?? 'magic';

  let tempPassword: string | null = null;
  let passwordHash: string | null = null;

  if (type === 'temp_password') {
    tempPassword = toBase64Url(crypto.getRandomValues(new Uint8Array(12)));
    passwordHash = await hashPassword(tempPassword);
  }

  await db
    .prepare(
      `INSERT INTO invites
        (id, email, role, engagement_ids, name, vis, token_hash, type, expires_at, created_at, created_by, metadata)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
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
    )
    .run();

  if (tempPassword) {
    await upsertUser(db, {
      email: payload.email,
      role: payload.role,
      engagementIds,
      name: payload.name ?? null,
      vis: payload.vis ?? null,
      passwordHash,
      status: 'active',
    });
  }

  const inviteRow = (await db
    .prepare('SELECT * FROM invites WHERE id = ?')
    .bind(inviteId)
    .first()) as Record<string, unknown>;

  return {
    invite: mapInvite(inviteRow),
    token,
    tempPassword,
  };
};

export const consumeInviteToken = async (db: D1Database, token: string) => {
  const tokenHash = await sha256Hex(token);
  const row = (await db
    .prepare('SELECT * FROM invites WHERE token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first()) as Record<string, unknown> | null;
  if (!row) return null;

  const invite = mapInvite(row);
  if (invite.usedAt) return null;
  if (Date.parse(invite.expiresAt) <= Date.now()) return null;

  await db.prepare('UPDATE invites SET used_at = ? WHERE id = ?').bind(now(), invite.id).run();

  const user = await upsertUser(db, {
    email: invite.email,
    role: invite.role,
    engagementIds: invite.engagementIds,
    name: invite.name ?? null,
    vis: invite.vis ?? null,
    status: 'active',
  });

  return { invite, user };
};
