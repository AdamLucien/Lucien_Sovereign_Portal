import { isProduction } from '../../../../../../lib/config';
import { errorResponse } from '../../../../../../lib/errors';
import { jsonResponse } from '../../../../../../lib/response';
import { getChannelState } from '../../../../../../lib/secure-channel';

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

  const state = await getChannelState(engagementId);

  return jsonResponse({
    engagementId,
    status: state.status,
    mode: state.mode,
    serverPublicKey: state.serverPublicKey,
    updatedAt: state.updatedAt,
    note: 'E2EE_STUB_CIPHERTEXT_ONLY',
  });
}
