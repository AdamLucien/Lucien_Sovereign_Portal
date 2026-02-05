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

  const now = new Date();
  const alerts = [
    {
      id: 'alert-001',
      level: 'info',
      message: 'Telemetry stream operational.',
      raisedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 'alert-002',
      level: 'warning',
      message: 'Storage retention approaching limit.',
      raisedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ];
  const metrics = [
    { label: 'Packet success', value: '98.6 %', trend: 'minor_up' },
    { label: 'Latency', value: '320 ms', trend: 'steady' },
    { label: 'Ops backlog', value: '3 items', trend: 'minor_down' },
  ];

  return jsonResponse({
    engagementId,
    systemStatus: 'nominal',
    lastSyncAt: now.toISOString(),
    metrics,
    alerts,
  });
}
