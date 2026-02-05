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

type ContractStatus = 'signed' | 'pending' | 'action' | 'not_wired';

type ContractItem = {
  type: 'nda' | 'msa' | 'sow' | 'dpa' | 'change_requests';
  label: string;
  status: ContractStatus;
  updatedAt: string | null;
  attachments: Array<{ id: string; name: string }>;
};

const CONTRACT_ORDER: ContractItem['type'][] = ['nda', 'msa', 'sow', 'dpa', 'change_requests'];

const CONTRACT_LABELS: Record<ContractItem['type'], string> = {
  nda: 'NDA',
  msa: 'MSA',
  sow: 'SOW / ANNEX',
  dpa: 'DPA',
  change_requests: 'CHANGE REQUESTS',
};

const normalize = (value?: string | null) => (value ?? '').trim().toLowerCase();

const mapType = (value?: string | null): ContractItem['type'] | null => {
  const text = normalize(value);
  if (!text) return null;
  if (text.includes('nda')) return 'nda';
  if (text.includes('msa')) return 'msa';
  if (text.includes('sow') || text.includes('annex')) return 'sow';
  if (text.includes('dpa')) return 'dpa';
  if (text.includes('change')) return 'change_requests';
  return null;
};

const mapStatus = (value?: string | null): ContractStatus => {
  const text = normalize(value);
  if (!text) return 'pending';
  if (text.includes('signed') || text.includes('executed') || text.includes('active')) {
    return 'signed';
  }
  if (text.includes('action') || text.includes('required')) {
    return 'action';
  }
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
    const records = await erpClient.fetchContractsByProject(engagementId);
    if (!records) {
      return jsonResponse({
        engagementId,
        wired: false,
        items: CONTRACT_ORDER.map((type) => ({
          type,
          label: CONTRACT_LABELS[type],
          status: 'not_wired' as const,
          updatedAt: null,
          attachments: [],
        })),
      });
    }

    const latestByType = new Map<ContractItem['type'], (typeof records)[number]>();

    records.forEach((record) => {
      const type = mapType(record.contract_type ?? record.name);
      if (!type) return;
      const existing = latestByType.get(type);
      if (!existing || toTimestamp(record.modified) > toTimestamp(existing.modified)) {
        latestByType.set(type, record);
      }
    });

    const items: ContractItem[] = CONTRACT_ORDER.map((type) => {
      const record = latestByType.get(type);
      return {
        type,
        label: CONTRACT_LABELS[type],
        status: record ? mapStatus(record.status) : 'pending',
        updatedAt: record?.modified ?? null,
        attachments: [],
      };
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
