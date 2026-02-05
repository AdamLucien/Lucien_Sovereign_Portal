import { erpClient, isERPClientError } from '../../../../../lib/erp-client';
import { errorResponse } from '../../../../../lib/errors';
import { jsonResponse } from '../../../../../lib/response';

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

type OutputStatus = 'pending' | 'in_progress' | 'delivered' | 'accepted';

type OutputItem = {
  id: string;
  title: string;
  category: string;
  status: OutputStatus;
  updatedAt: string | null;
  attachments: Array<{ id: string; name: string; size?: number }>;
};

const normalize = (value?: string | null) => (value ?? '').trim().toLowerCase();

const mapStatus = (value?: string | null): OutputStatus => {
  const text = normalize(value);
  if (text.includes('accepted')) return 'accepted';
  if (text.includes('delivered') || text.includes('complete')) return 'delivered';
  if (text.includes('progress') || text.includes('working')) return 'in_progress';
  return 'pending';
};

const toTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: engagementId } = await params;
  const headers = request.headers;
  const role = headers.get('x-lucien-role');
  const scope = parseScope(headers.get('x-lucien-scope'));

  if (role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return errorResponse(403, 'forbidden', 'Engagement access denied.');
  }

  try {
    const records = await erpClient.fetchOutputsByProject(engagementId);
    if (!records) {
      return jsonResponse({
        engagementId,
        wired: false,
        message: 'Outputs doctype not wired.',
        items: [],
      });
    }

    const items: OutputItem[] = records.map((record) => ({
      id: record.name,
      title: record.title ?? record.name,
      category: record.category ?? 'output',
      status: mapStatus(record.status),
      updatedAt: record.modified ?? null,
      attachments: [],
    }));

    items.sort((a, b) => {
      const dateDiff = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
      if (dateDiff !== 0) return dateDiff;
      return a.id.localeCompare(b.id);
    });

    return jsonResponse({
      engagementId,
      wired: true,
      items,
    });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(500, 'erp_unavailable', 'ERP request failed.');
    }
    return errorResponse(500, 'server_error', 'Unexpected server error.');
  }
}
