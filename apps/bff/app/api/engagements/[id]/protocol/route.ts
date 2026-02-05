import { erpClient, isERPClientError } from '../../../../../lib/erp-client';
import { errorResponse } from '../../../../../lib/errors';
import { jsonResponse } from '../../../../../lib/response';

type TimelineEntry = {
  id: string;
  label: string;
  status: 'complete' | 'in_progress' | 'pending';
  dueDate: string;
  owner: 'client' | 'operator';
};

type ProtocolTask = {
  id: string;
  label: string;
  status: 'blocked' | 'in_progress' | 'ready' | 'pending';
  owner: 'client' | 'operator';
  eta: string;
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

const buildTimeline = (startDate: string | null): TimelineEntry[] => {
  const baseline = startDate ? new Date(startDate) : new Date();
  const second = new Date(baseline);
  second.setDate(second.getDate() + 7);
  const third = new Date(second);
  third.setDate(third.getDate() + 14);
  return [
    {
      id: 'kickoff',
      label: 'Protocol kickoff',
      status: 'complete',
      dueDate: baseline.toISOString(),
      owner: 'operator',
    },
    {
      id: 'design',
      label: 'Strategy design',
      status: 'in_progress',
      dueDate: second.toISOString(),
      owner: 'operator',
    },
    {
      id: 'handover',
      label: 'Client validation',
      status: 'pending',
      dueDate: third.toISOString(),
      owner: 'client',
    },
  ];
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
    const project = await erpClient.fetchProjectById(engagementId);
    if (!project) {
      return errorResponse(404, 'project_not_found', 'Engagement not found.');
    }

    const timeline = buildTimeline(
      project.actual_start_date ?? project.expected_start_date ?? null,
    );
    const tasks: ProtocolTask[] = [
      {
        id: 'spec',
        label: 'Finalize protocol spec',
        status: 'in_progress',
        owner: 'operator',
        eta: timeline[1].dueDate,
      },
      {
        id: 'review',
        label: 'Client review & approval',
        status: 'pending',
        owner: 'client',
        eta: timeline[2].dueDate,
      },
      {
        id: 'go_live',
        label: 'Operational go-live',
        status: 'pending',
        owner: 'operator',
        eta: new Date(
          new Date(timeline[2].dueDate).getTime() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    ];

    return jsonResponse({
      engagementId,
      phase: 'Protocol Integration',
      status: 'in_progress',
      timeline,
      tasks,
      note: 'Live telemetry will appear once design artifacts are signed off.',
    });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(500, 'erp_unavailable', 'ERP request failed.');
    }
    throw error;
  }
}
