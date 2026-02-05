import { randomBytes } from 'crypto';

import 'server-only';

import { redisClient } from './redis';

export type SecureChannelStatus = 'pending' | 'ready';

export type SecureChannelState = {
  engagementId: string;
  status: SecureChannelStatus;
  mode: 'e2ee_stub';
  serverPublicKey: string;
  clientPublicKey?: string;
  updatedAt: string;
};

export type SecureMessage = {
  id: string;
  ciphertext: string;
  nonce: string;
  sender: 'client' | 'operator';
  sentAt: string;
};

const SERVER_PUBLIC_KEY = process.env.SECURE_CHANNEL_SERVER_PUBLIC_KEY?.trim()
  ? process.env.SECURE_CHANNEL_SERVER_PUBLIC_KEY.trim()
  : randomBytes(32).toString('base64');

const MESSAGE_TTL_SECONDS = (() => {
  const raw = Number.parseInt(process.env.LUCIEN_SECURE_CHANNEL_RETENTION_SECONDS ?? '86400', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 86400;
})();

const MESSAGE_MAX_COUNT = (() => {
  const raw = Number.parseInt(process.env.LUCIEN_SECURE_CHANNEL_MAX_MESSAGES ?? '250', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 250;
})();

const stateKey = (engagementId: string) => `lucien:secure:channel:state:${engagementId}`;
const messageSetKey = (engagementId: string) => `lucien:secure:channel:messages:${engagementId}`;
const messageKey = (engagementId: string, messageId: string) =>
  `lucien:secure:channel:message:${engagementId}:${messageId}`;

const now = () => new Date().toISOString();

const fallbackChannels = new Map<string, SecureChannelState>();
const fallbackMessages = new Map<string, SecureMessage[]>();

const asString = (value: unknown) => (typeof value === 'string' ? value : undefined);

const hydrateState = (
  engagementId: string,
  raw: Record<string, unknown> | null,
): SecureChannelState => {
  const base: SecureChannelState = {
    engagementId,
    status: (asString(raw?.status) as SecureChannelStatus) ?? 'pending',
    mode: 'e2ee_stub',
    serverPublicKey: asString(raw?.serverPublicKey) ?? SERVER_PUBLIC_KEY,
    clientPublicKey: asString(raw?.clientPublicKey) || undefined,
    updatedAt: asString(raw?.updatedAt) ?? now(),
  };
  return base;
};

const persistState = async (state: SecureChannelState) => {
  if (!redisClient) return;
  await redisClient.hset(stateKey(state.engagementId), {
    status: state.status,
    serverPublicKey: state.serverPublicKey,
    clientPublicKey: state.clientPublicKey ?? '',
    updatedAt: state.updatedAt,
    mode: state.mode,
  });
  await redisClient.expire(stateKey(state.engagementId), MESSAGE_TTL_SECONDS);
};

export const getChannelState = async (engagementId: string): Promise<SecureChannelState> => {
  if (!redisClient) {
    const existing = fallbackChannels.get(engagementId);
    if (existing) return existing;
    const state: SecureChannelState = {
      engagementId,
      status: 'pending',
      mode: 'e2ee_stub',
      serverPublicKey: SERVER_PUBLIC_KEY,
      updatedAt: now(),
    };
    fallbackChannels.set(engagementId, state);
    return state;
  }

  const stored = await redisClient.hgetall(stateKey(engagementId));
  if (stored && stored.status) {
    return hydrateState(engagementId, stored);
  }

  const initialState: SecureChannelState = {
    engagementId,
    status: 'pending',
    mode: 'e2ee_stub',
    serverPublicKey: SERVER_PUBLIC_KEY,
    updatedAt: now(),
  };
  await persistState(initialState);
  return initialState;
};

export const updateHandshake = async (
  engagementId: string,
  clientPublicKey: string,
): Promise<SecureChannelState> => {
  const current = await getChannelState(engagementId);
  const updated: SecureChannelState = {
    ...current,
    status: 'ready',
    clientPublicKey,
    updatedAt: now(),
  };

  if (redisClient) {
    await persistState(updated);
  } else {
    fallbackChannels.set(engagementId, updated);
  }

  return updated;
};

const retentionCandidates = async (engagementId: string) => {
  const client = redisClient;
  if (!client) return;
  const total = await client.zcard(messageSetKey(engagementId));
  if (total <= MESSAGE_MAX_COUNT) return;
  const overflow = total - MESSAGE_MAX_COUNT;
  const staleIdsRaw = await client.zrange(messageSetKey(engagementId), 0, overflow - 1);
  const staleIds = staleIdsRaw.filter((id): id is string => typeof id === 'string');
  if (!staleIds.length) return;
  await client.zrem(messageSetKey(engagementId), ...staleIds);
  await client.del(...staleIds.map((id) => messageKey(engagementId, id)));
};

const serializeMessage = (payload: SecureMessage) => JSON.stringify(payload);

export const listMessages = async (
  engagementId: string,
  cursor?: string | null,
  limit = 50,
): Promise<{ items: SecureMessage[]; nextCursor: string | null }> => {
  const resolvedLimit = Math.max(1, Math.min(limit, MESSAGE_MAX_COUNT));

  if (!redisClient) {
    const items = fallbackMessages.get(engagementId) ?? [];
    const sorted = [...items].sort((a, b) => {
      const aTime = new Date(a.sentAt).getTime();
      const bTime = new Date(b.sentAt).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    });
    let startIndex = 0;
    if (cursor) {
      const index = sorted.findIndex((item) => item.id === cursor);
      if (index >= 0) startIndex = index + 1;
    }
    const slice = sorted.slice(startIndex, startIndex + resolvedLimit);
    const nextCursor = slice.length ? slice[slice.length - 1].id : null;
    return { items: slice, nextCursor };
  }

  const client = redisClient;
  if (!client) {
    return { items: [], nextCursor: null };
  }

  const setKey = messageSetKey(engagementId);
  let start = 0;
  if (cursor) {
    const rank = await client.zrank(setKey, cursor);
    if (typeof rank === 'number' && rank >= 0) {
      start = rank + 1;
    }
  }
  const idsRaw = await client.zrange(setKey, start, start + resolvedLimit - 1);
  const ids = idsRaw.filter((id): id is string => typeof id === 'string');
  if (!ids.length) {
    return { items: [], nextCursor: null };
  }
  const values = await Promise.all(
    ids.map(async (id) => {
      const serialized = await client.get(messageKey(engagementId, id));
      if (typeof serialized !== 'string') return null;
      try {
        return JSON.parse(serialized) as SecureMessage;
      } catch {
        return null;
      }
    }),
  );
  const filtered = values.filter((item): item is SecureMessage => Boolean(item));
  const nextCursor = filtered.length ? filtered[filtered.length - 1].id : null;
  return { items: filtered, nextCursor };
};

export const appendMessage = async (
  engagementId: string,
  message: Omit<SecureMessage, 'id'>,
): Promise<SecureMessage> => {
  const payload: SecureMessage = {
    ...message,
    id: `MSG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  };

  if (!redisClient) {
    const items = fallbackMessages.get(engagementId) ?? [];
    items.push(payload);
    if (items.length > MESSAGE_MAX_COUNT) {
      items.splice(0, items.length - MESSAGE_MAX_COUNT);
    }
    fallbackMessages.set(engagementId, items);
    return payload;
  }

  const client = redisClient;
  if (!client) {
    fallbackMessages.set(engagementId, [payload]);
    return payload;
  }

  const setKey = messageSetKey(engagementId);
  const score = Number.isFinite(Date.parse(payload.sentAt))
    ? Date.parse(payload.sentAt)
    : Date.now();

  await client.zadd(setKey, { score, member: payload.id });
  await client.set(messageKey(engagementId, payload.id), serializeMessage(payload), {
    ex: MESSAGE_TTL_SECONDS,
  });
  await client.expire(setKey, MESSAGE_TTL_SECONDS);

  await retentionCandidates(engagementId);

  return payload;
};
