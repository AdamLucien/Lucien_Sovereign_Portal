import { errorResponse } from '../../../../../../lib/errors';
import { jsonResponse } from '../../../../../../lib/response';

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
  const { id: engagementId } = await params;
  const headers = request.headers;
  const role = headers.get('x-lucien-role');
  const scope = parseScope(headers.get('x-lucien-scope'));

  if (role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return errorResponse(403, 'forbidden', 'Engagement access denied.');
  }

  return jsonResponse({
    engagementId,
    roles: [
      { role: 'OPERATOR', assigned: true, scope: 'ALL', lastReviewedAt: new Date().toISOString() },
      {
        role: 'CLIENT_LEAD',
        assigned: Boolean(role === 'CLIENT'),
        scope: scope.all ? 'ALL' : scope.ids.join(',') || 'SCOPED',
        lastReviewedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        role: 'AUDITOR',
        assigned: false,
        scope: 'READ_ONLY',
        lastReviewedAt: null,
      },
    ],
    note: 'Role bindings derive from LDAP in production; current data is simulated.',
  });
}
