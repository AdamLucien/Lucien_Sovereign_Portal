import { erpClient, isERPClientError } from '../../../../../../lib/erp-client';
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

  try {
    const requests = await erpClient.fetchClientRequestsByProject(engagementId);
    const items = requests.map((entry) => ({
      id: entry.name,
      title: entry.title,
      status: entry.status,
      required: entry.required,
      visibility: entry.visibility ?? 'operator_only',
      assignedTo: entry.required ? 'Ops Team' : 'Client',
    }));

    return jsonResponse({
      engagementId,
      items,
    });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(502, 'erp_unavailable', 'ERP request failed.');
    }
    throw error;
  }
}
