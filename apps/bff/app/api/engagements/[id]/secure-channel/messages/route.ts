import { isProduction } from '../../../../../../lib/config';
import { errorResponse } from '../../../../../../lib/errors';
import { checkRateLimit } from '../../../../../../lib/redis';
import { parseJsonBody } from '../../../../../../lib/request';
import { jsonResponse } from '../../../../../../lib/response';
import { appendMessage, listMessages } from '../../../../../../lib/secure-channel';

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;
const MAX_MESSAGE_BODY_BYTES = 50 * 1024;
const MAX_CIPHERTEXT_LENGTH = 32768;
const MAX_NONCE_LENGTH = 1024;

const parseScope = (scopeHeader: string | null) => {
  if (!scopeHeader) return { all: false, ids: [] as string[] };
  const normalized = scopeHeader.trim();
  if (normalized.toUpperCase() === 'ALL') {
    return { all: true, ids: [] as string[] };
  }
  return {
    all: false,
    ids: normalized
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
};

const withRateHeaders = (
  response: import('next/server').NextResponse,
  limit: number,
  remaining: number,
): import('next/server').NextResponse => {
  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  return response;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isProduction()) {
    return errorResponse(
      501,
      'secure_channel_disabled',
      'Secure channel is disabled in production.',
    );
  }

  const { id: engagementId } = await params;
  const headers = request.headers;
  const role = headers.get('x-lucien-role');
  const scope = parseScope(headers.get('x-lucien-scope'));

  if (role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return errorResponse(403, 'forbidden', 'Engagement access denied.');
  }

  const cursor = new URL(request.url).searchParams.get('cursor');
  const { items, nextCursor } = await listMessages(engagementId, cursor);

  return jsonResponse({
    engagementId,
    items,
    nextCursor,
    mode: 'e2ee_stub',
    note: 'E2EE_STUB_CIPHERTEXT_ONLY',
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isProduction()) {
    return errorResponse(
      501,
      'secure_channel_disabled',
      'Secure channel is disabled in production.',
    );
  }

  const { id: engagementId } = await params;
  const headers = request.headers;
  const role = headers.get('x-lucien-role');
  const uid = headers.get('x-lucien-uid');
  const scope = parseScope(headers.get('x-lucien-scope'));

  if (!uid) {
    return errorResponse(403, 'forbidden', 'Missing session context.');
  }

  const rateKey = `lucien:rl:secure:messages:${uid}`;
  const rate = await checkRateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_SECONDS);

  if (rate.count > RATE_LIMIT) {
    const response = errorResponse(429, 'rate_limited', 'Too many messages.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  if (role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    const response = errorResponse(403, 'forbidden', 'Engagement access denied.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  const { data, error } = await parseJsonBody<{
    ciphertext?: string;
    nonce?: string;
    sender?: string;
    sentAt?: string;
  }>(request, { maxBytes: MAX_MESSAGE_BODY_BYTES });
  if (error) {
    return withRateHeaders(error, RATE_LIMIT, rate.remaining);
  }

  const ciphertext = data?.ciphertext?.trim() ?? '';
  const nonce = data?.nonce?.trim() ?? '';
  const sender = data?.sender === 'operator' ? 'operator' : 'client';
  const sentAt = data?.sentAt ?? new Date().toISOString();

  if (!ciphertext || !nonce) {
    const response = errorResponse(400, 'invalid_payload', 'ciphertext and nonce required.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  if (ciphertext.length > MAX_CIPHERTEXT_LENGTH || nonce.length > MAX_NONCE_LENGTH) {
    const response = errorResponse(413, 'payload_too_large', 'ciphertext or nonce too large.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  const message = await appendMessage(engagementId, {
    ciphertext,
    nonce,
    sender,
    sentAt,
  });

  const response = jsonResponse({
    engagementId,
    accepted: true,
    id: message.id,
    sentAt: message.sentAt,
    mode: 'e2ee_stub',
  });

  return withRateHeaders(response, RATE_LIMIT, rate.remaining);
}
