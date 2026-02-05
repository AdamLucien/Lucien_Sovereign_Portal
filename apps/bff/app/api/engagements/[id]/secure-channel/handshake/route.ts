import { isProduction } from '../../../../../../lib/config';
import { errorResponse } from '../../../../../../lib/errors';
import { checkRateLimit } from '../../../../../../lib/redis';
import { parseJsonBody } from '../../../../../../lib/request';
import { jsonResponse } from '../../../../../../lib/response';
import { updateHandshake } from '../../../../../../lib/secure-channel';

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;
const MAX_HANDSHAKE_BODY_BYTES = 16 * 1024;
const MAX_PUBLIC_KEY_LENGTH = 4096;

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

  const rateKey = `lucien:rl:secure:handshake:${uid}`;
  const rate = await checkRateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_SECONDS);

  if (rate.count > RATE_LIMIT) {
    const response = errorResponse(429, 'rate_limited', 'Too many requests.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  if (role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    const response = errorResponse(403, 'forbidden', 'Engagement access denied.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  const { data, error } = await parseJsonBody<{ clientPublicKey?: string }>(request, {
    maxBytes: MAX_HANDSHAKE_BODY_BYTES,
  });
  if (error) {
    return withRateHeaders(error, RATE_LIMIT, rate.remaining);
  }

  const clientPublicKey = data?.clientPublicKey?.trim() ?? '';
  if (!clientPublicKey) {
    const response = errorResponse(400, 'invalid_payload', 'clientPublicKey required.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  if (clientPublicKey.length > MAX_PUBLIC_KEY_LENGTH) {
    const response = errorResponse(413, 'payload_too_large', 'clientPublicKey too large.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  const state = await updateHandshake(engagementId, clientPublicKey);

  const response = jsonResponse({
    engagementId,
    status: state.status,
    mode: state.mode,
    serverPublicKey: state.serverPublicKey,
    updatedAt: state.updatedAt,
    note: 'E2EE_STUB_CIPHERTEXT_ONLY',
  });

  return withRateHeaders(response, RATE_LIMIT, rate.remaining);
}
