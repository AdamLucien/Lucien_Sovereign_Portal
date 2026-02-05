import type { JWTPayload } from 'jose';

export interface LucienSession {
  uid: string;
  role: string;
  engagementIds: string[];
  vis: unknown;
  jti: string;
  iat: number;
  exp: number;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number';

const toStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  if (!value.every(isString)) return null;
  return value;
};

export const parseLucienSession = (payload: JWTPayload): LucienSession | null => {
  const data = payload as Record<string, unknown>;

  if (!isString(data.uid)) return null;
  if (!isString(data.role)) return null;
  if (!isString(data.jti)) return null;
  if (!isNumber(data.iat)) return null;
  if (!isNumber(data.exp)) return null;

  const engagementIds = toStringArray(data.engagementIds) ?? [];

  return {
    uid: data.uid,
    role: data.role,
    engagementIds,
    vis: data.vis ?? null,
    jti: data.jti,
    iat: data.iat,
    exp: data.exp,
  };
};
