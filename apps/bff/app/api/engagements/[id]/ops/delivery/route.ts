import { erpClient, isERPClientError } from '../../../../../../lib/erp-client';
import { errorResponse } from '../../../../../../lib/errors';
import { jsonResponse } from '../../../../../../lib/response';

type PipelineStage = {
  id: string;
  label: string;
  status: 'complete' | 'in_progress' | 'pending';
  owner: 'client' | 'operator';
  updatedAt: string;
};

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

const mapStatus = (value?: string): PipelineStage['status'] => {
  if (!value) return 'pending';
  const normalized = value.toLowerCase();
  if (normalized.includes('accepted') || normalized.includes('delivered')) return 'complete';
  if (normalized.includes('in_progress') || normalized.includes('progress')) return 'in_progress';
  return 'pending';
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
    const outputs = (await erpClient.fetchOutputsByProject(engagementId)) ?? [];
    const stages: PipelineStage[] =
      outputs.length > 0
        ? outputs.map((entry, index) => ({
            id: entry.name,
            label: entry.title ?? `Deliverable ${index + 1}`,
            status: mapStatus(entry.status),
            owner: index % 2 === 0 ? 'operator' : 'client',
            updatedAt: entry.modified ?? new Date().toISOString(),
          }))
        : [
            {
              id: 'planning',
              label: 'Delivery planning',
              status: 'in_progress',
              owner: 'operator',
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'handover',
              label: 'Client handover',
              status: 'pending',
              owner: 'client',
              updatedAt: new Date().toISOString(),
            },
          ];

    return jsonResponse({
      engagementId,
      stages,
      note: 'Statuses reflect deliverables from ERP when wired, otherwise the default pipeline is in flight.',
    });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(502, 'erp_unavailable', 'ERP request failed.');
    }
    throw error;
  }
}
