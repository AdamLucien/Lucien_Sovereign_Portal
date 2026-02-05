import { erpClient, isERPClientError } from '../../../lib/erp-client';
import { errorResponse } from '../../../lib/errors';
import { jsonResponse } from '../../../lib/response';

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

export async function GET(request: Request) {
  const headers = request.headers;
  const role = headers.get('x-lucien-role');
  const scope = parseScope(headers.get('x-lucien-scope'));

  if (role === 'CLIENT' && !scope.all && scope.ids.length === 0) {
    return errorResponse(403, 'forbidden', 'No engagements available.');
  }

  try {
    if (scope.all) {
      const projects = await erpClient.fetchProjects();
      const items = projects
        .map((project) => ({
          id: project.name,
          label: project.project_name ?? project.name,
          status: project.status ?? null,
          startDate: project.actual_start_date ?? project.expected_start_date ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      return jsonResponse({ items });
    }

    const items = scope.ids
      .map((id) => ({ id, label: id, status: null, startDate: null }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return jsonResponse({ items });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(500, 'erp_unavailable', 'ERP request failed.');
    }
    return errorResponse(500, 'server_error', 'Unexpected server error.');
  }
}
