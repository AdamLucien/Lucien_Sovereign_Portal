import { erpClient, isERPClientError } from '../../../../../lib/erp-client';
import { errorResponse } from '../../../../../lib/errors';
import { checkRateLimit } from '../../../../../lib/redis';
import { jsonResponse } from '../../../../../lib/response';

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: directiveId } = await params;
  const headers = request.headers;
  const role = headers.get('x-lucien-role');
  const uid = headers.get('x-lucien-uid');
  const scope = parseScope(headers.get('x-lucien-scope'));

  if (!uid) {
    return errorResponse(403, 'forbidden', 'Missing session context.');
  }

  const rateKey = `lucien:rl:mutation:uid:${uid}`;
  const rate = await checkRateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (rate.count > RATE_LIMIT) {
    return errorResponse(429, 'rate_limited', 'Too many mutation requests.');
  }

  if (role === 'OPERATOR') {
    return jsonResponse({ success: true, signal: 'OPERATOR_BYPASS' });
  }

  try {
    const directive = await erpClient.fetchDirectiveById(directiveId);
    if (!directive) {
      return errorResponse(403, 'directive_not_found', 'Directive not found.');
    }

    if (role === 'CLIENT' && !scope.all && !scope.ids.includes(directive.project)) {
      return errorResponse(403, 'forbidden', 'Directive access denied.');
    }

    if (directive.ack_at) {
      return jsonResponse({ success: true, signal: 'ALREADY_ACKED' });
    }

    const ackAt = new Date().toISOString();
    await erpClient.updateDirectiveAck(directive.name, { ack_by: uid, ack_at: ackAt });

    return jsonResponse({ success: true, signal: 'ACKED' });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(502, 'erp_unavailable', 'ERP request failed.');
    }
    throw error;
  }
}
