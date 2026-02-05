import { erpClient, isERPClientError } from '../../../../../lib/erp-client';
import { errorResponse } from '../../../../../lib/errors';
import { INTEL_TEMPLATES, type IntelField } from '../../../../../lib/intel-templates';
import { jsonResponse } from '../../../../../lib/response';

const filterFieldsByRole = (fields: IntelField[], role: string | null): IntelField[] => {
  if (role !== 'CLIENT') return fields;
  return fields.filter((field) => !field.visibility || field.visibility === 'client_visible');
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
    const sortedRequests = [...requests].sort((a, b) => {
      if (a.required !== b.required) {
        return a.required ? -1 : 1;
      }
      const statusCompare = a.status.localeCompare(b.status);
      if (statusCompare !== 0) return statusCompare;
      return a.name.localeCompare(b.name);
    });

    const responses = await Promise.all(
      sortedRequests.map(async (record) => {
        if (role === 'CLIENT' && record.visibility !== 'client_visible') {
          return null;
        }

        const template = INTEL_TEMPLATES[record.template_key];
        const fields = template ? filterFieldsByRole(template.fields, role) : [];
        const attachments = await erpClient.fetchFileAttachmentsForRequest(record.name);

        return {
          id: record.name,
          project: record.project,
          title: record.title,
          description: record.description ?? null,
          status: record.status,
          required: record.required,
          templateKey: record.template_key,
          visibility: record.visibility ?? null,
          fields,
          attachments: attachments.map((file) => ({
            id: file.name,
            fileName: file.file_name,
            fileUrl: file.file_url,
            isPrivate: file.is_private,
          })),
        };
      }),
    );

    return jsonResponse(responses.filter(Boolean));
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(502, 'erp_unavailable', 'ERP request failed.');
    }
    throw error;
  }
}
