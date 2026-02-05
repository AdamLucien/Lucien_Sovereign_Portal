import { randomUUID, scryptSync, timingSafeEqual } from 'crypto';

import { SignJWT } from 'jose';

import { getUserByEmail, updateUserLastLogin } from './auth-store';
import { getJwtSecret } from './config';
import { jsonResponse } from './response';

import type { LucienSession } from './session';

export type AuthUser = {
  email: string;
  role: string;
  engagementIds: string[];
  name?: string | null;
  vis?: unknown;
};

const encoder = new TextEncoder();
const jwtSecret = getJwtSecret();
const sessionTtl = Number.parseInt(process.env.LUCIEN_SESSION_TTL ?? '28800', 10);
const authMode = (process.env.AUTH_MODE ?? 'local').toLowerCase();
const allowPlain = (process.env.ALLOW_PLAINTEXT_PASSWORDS ?? 'false').toLowerCase() === 'true';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const verifyScrypt = (password: string, hash: string): boolean => {
  const parts = hash.split('$');
  if (parts.length !== 2) return false;
  const [saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (!salt.length || !expected.length) return false;
  const derived = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, derived);
};

const verifyPassword = (password: string, passwordHash: string): boolean => {
  const trimmed = passwordHash.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('scrypt$')) {
    return verifyScrypt(password, trimmed.slice('scrypt$'.length));
  }

  if (allowPlain && trimmed.startsWith('plain$')) {
    const stored = Buffer.from(trimmed.slice('plain$'.length));
    const incoming = Buffer.from(password);
    if (stored.length !== incoming.length) return false;
    return timingSafeEqual(stored, incoming);
  }

  return false;
};

const mapStoredUser = (user: {
  email: string;
  role: string;
  engagementIds: string[];
  name?: string | null;
  vis?: unknown;
}): AuthUser => {
  return {
    email: user.email,
    role: user.role,
    engagementIds: Array.from(new Set(user.engagementIds)).sort(),
    name: user.name ?? null,
    vis: user.vis ?? (user.role === 'OPERATOR' ? 'ALL' : null),
  };
};

const verifyErpCredentials = async (email: string, password: string): Promise<boolean> => {
  const base = process.env.ERP_BASE_URL?.replace(/\/$/, '');
  if (!base) return false;

  const body = new URLSearchParams({ usr: email, pwd: password });
  try {
    const response = await fetch(`${base}/api/method/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    return response.ok;
  } catch {
    return false;
  }
};

export const authenticateUser = async (
  email: string,
  password: string,
): Promise<AuthUser | null> => {
  const normalizedEmail = normalizeEmail(email);
  const storedUser = getUserByEmail(normalizedEmail);

  if (authMode === 'erp') {
    if (!password) return null;
    const ok = await verifyErpCredentials(normalizedEmail, password);
    if (!ok) return null;
    if (!storedUser || storedUser.status !== 'active') return null;
    updateUserLastLogin(storedUser.id);
    return mapStoredUser(storedUser);
  }

  if (!storedUser || storedUser.status !== 'active') return null;
  if (!verifyPassword(password, storedUser.passwordHash ?? '')) return null;
  updateUserLastLogin(storedUser.id);
  return mapStoredUser(storedUser);
};

export const createSessionToken = async (user: AuthUser) => {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (Number.isFinite(sessionTtl) ? sessionTtl : 60 * 60 * 8);

  const payload: Omit<LucienSession, 'jti' | 'iat' | 'exp'> = {
    uid: user.email,
    role: user.role,
    engagementIds: user.engagementIds,
    vis: user.vis ?? null,
  } as Omit<LucienSession, 'jti' | 'iat' | 'exp'>;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(randomUUID())
    .sign(encoder.encode(jwtSecret));

  return { token, exp, expiresIn: exp - now };
};

export const attachSessionCookie = (
  response: ReturnType<typeof jsonResponse>,
  token: string,
  maxAge: number,
) => {
  response.cookies.set('lucien_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
};

export const clearSessionCookie = (response: ReturnType<typeof jsonResponse>) => {
  response.cookies.set('lucien_session', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
};
