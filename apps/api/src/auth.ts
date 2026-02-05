import { SignJWT, jwtVerify } from 'jose';

import { updateUserLastLogin, verifyPassword, getUserByEmail } from './auth-store';

export type LucienSession = {
  uid: string;
  role: string;
  engagementIds: string[];
  vis: unknown;
  jti: string;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();

export const createSessionToken = async (
  payload: Omit<LucienSession, 'jti' | 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
) => {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(crypto.randomUUID())
    .sign(encoder.encode(secret));
  return { token, exp, expiresIn: exp - now };
};

export const verifySessionToken = async (token: string, secret: string) => {
  const verified = await jwtVerify(token, encoder.encode(secret));
  return verified.payload as unknown as LucienSession;
};

export const authenticateUser = async (db: D1Database, email: string, password: string) => {
  const user = await getUserByEmail(db, email);
  if (!user || user.status !== 'active') return null;
  const ok = await verifyPassword(password, user.passwordHash ?? '');
  if (!ok) return null;
  await updateUserLastLogin(db, user.id);
  return user;
};
