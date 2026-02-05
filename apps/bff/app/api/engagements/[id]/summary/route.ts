import { erpClient, getDataMode, isERPClientError } from '../../../../../lib/erp-client';
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

type EngagementStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';
type EngagementTier = 'INTEL_ONLY' | 'BLUEPRINT' | 'CUSTOM';
type ModuleState = 'active' | 'pending' | 'locked' | 'action' | 'not_wired';
type ModuleRole = 'operator_only';

type ModuleKey =
  | 'intel'
  | 'protocol'
  | 'outputs'
  | 'secureChannel'
  | 'contracts'
  | 'billing'
  | 'settlement'
  | 'opsConsole'
  | 'requestBuilder'
  | 'deliveryPipeline'
  | 'accessRoles';

type ModuleInfo = {
  state: ModuleState;
  reason?: string;
  role?: ModuleRole;
  wired?: boolean;
};

type ModuleOverride = {
  state: ModuleState;
  reason?: string;
};

const MODULE_STATES: ModuleState[] = ['active', 'pending', 'locked', 'action', 'not_wired'];

const MODULE_ORDER: ModuleKey[] = [
  'intel',
  'protocol',
  'outputs',
  'secureChannel',
  'contracts',
  'billing',
  'settlement',
  'opsConsole',
  'requestBuilder',
  'deliveryPipeline',
  'accessRoles',
];

const OPERATOR_ONLY_MODULES = new Set<ModuleKey>([
  'opsConsole',
  'requestBuilder',
  'deliveryPipeline',
  'accessRoles',
]);

const tierModuleDefaults: Record<EngagementTier, Record<ModuleKey, ModuleInfo>> = {
  INTEL_ONLY: {
    intel: { state: 'active' },
    protocol: { state: 'locked', reason: 'tier_intel_only' },
    outputs: { state: 'locked', reason: 'tier_intel_only' },
    secureChannel: { state: 'locked', reason: 'tier_intel_only' },
    contracts: { state: 'locked', reason: 'tier_intel_only' },
    billing: { state: 'locked', reason: 'tier_custom_only' },
    settlement: { state: 'locked', reason: 'tier_intel_only' },
    opsConsole: { state: 'active' },
    requestBuilder: { state: 'action', reason: 'operator_queue' },
    deliveryPipeline: { state: 'pending', reason: 'pipeline_init' },
    accessRoles: { state: 'locked', reason: 'operator_only' },
  },
  BLUEPRINT: {
    intel: { state: 'active' },
    protocol: { state: 'pending', reason: 'kickoff' },
    outputs: { state: 'locked', reason: 'delivery' },
    secureChannel: { state: 'pending', reason: 'key_exchange' },
    contracts: { state: 'action', reason: 'nda_required' },
    billing: { state: 'locked', reason: 'tier_custom_only' },
    settlement: { state: 'locked', reason: 'final_acceptance' },
    opsConsole: { state: 'active' },
    requestBuilder: { state: 'action', reason: 'operator_queue' },
    deliveryPipeline: { state: 'pending', reason: 'pipeline_init' },
    accessRoles: { state: 'locked', reason: 'operator_only' },
  },
  CUSTOM: {
    intel: { state: 'active' },
    protocol: { state: 'active' },
    outputs: { state: 'active' },
    secureChannel: { state: 'active', reason: 'ready' },
    contracts: { state: 'active' },
    billing: { state: 'active' },
    settlement: { state: 'active' },
    opsConsole: { state: 'active' },
    requestBuilder: { state: 'active' },
    deliveryPipeline: { state: 'pending', reason: 'pipeline_init' },
    accessRoles: { state: 'active' },
  },
};

const mapStatus = (status?: string | null): EngagementStatus => {
  if (!status) return 'PAUSED';
  const normalized = status.trim().toLowerCase();
  if (normalized === 'open' || normalized === 'active') return 'ACTIVE';
  if (normalized === 'completed' || normalized === 'closed') return 'CLOSED';
  return 'PAUSED';
};

const resolveTier = (project: Record<string, unknown>): EngagementTier | null => {
  const tierField = process.env.LUCIEN_TIER_FIELD?.trim();
  if (!tierField) return null;
  const raw = project[tierField];
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('intel')) return 'INTEL_ONLY';
  if (normalized.includes('blueprint')) return 'BLUEPRINT';
  if (normalized.includes('custom')) return 'CUSTOM';
  return null;
};

const normalize = (value?: string | null) => (value ?? '').trim().toLowerCase();

const mapContractType = (
  value?: string | null,
): 'nda' | 'msa' | 'sow' | 'dpa' | 'change_requests' | null => {
  const text = normalize(value);
  if (!text) return null;
  if (text.includes('nda')) return 'nda';
  if (text.includes('msa')) return 'msa';
  if (text.includes('sow') || text.includes('annex')) return 'sow';
  if (text.includes('dpa')) return 'dpa';
  if (text.includes('change')) return 'change_requests';
  return null;
};

const mapContractStatus = (value?: string | null): 'signed' | 'pending' | 'action' => {
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

const readModuleOverrides = (project: Record<string, unknown>) => {
  const raw = project.lucien_modules;
  if (!raw || typeof raw !== 'object') return {};
  const overrides: Partial<Record<ModuleKey, ModuleOverride>> = {};

  MODULE_ORDER.forEach((key) => {
    const entry = (raw as Record<string, unknown>)[key];
    if (!entry || typeof entry !== 'object') return;
    const state = (entry as { state?: string }).state;
    if (!state || !MODULE_STATES.includes(state as ModuleState)) return;
    const reason = (entry as { reason?: string }).reason;
    overrides[key] = { state: state as ModuleState, reason };
  });

  return overrides;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: engagementId } = await params;
  const headers = request.headers;
  const scope = parseScope(headers.get('x-lucien-scope'));
  const dataMode = getDataMode();

  if (!scope.all && !scope.ids.includes(engagementId)) {
    return errorResponse(403, 'forbidden', 'Engagement access denied.');
  }

  try {
    const project = await erpClient.fetchProjectById(engagementId);
    if (!project) {
      return errorResponse(404, 'project_not_found', 'Engagement not found.');
    }

    const tier = resolveTier(project as Record<string, unknown>);
    const status = mapStatus(project.status);
    const startDate = project.actual_start_date ?? project.expected_start_date ?? null;
    const moduleOverrides: Partial<Record<ModuleKey, ModuleOverride>> =
      dataMode === 'mock' ? readModuleOverrides(project as Record<string, unknown>) : {};
    let contractsWired = true;
    let outputsWired = true;
    let ndaSigned: boolean | null = null;

    const clientRequests = await erpClient.fetchClientRequestsByProject(engagementId);
    const contracts = await erpClient.fetchContractsByProject(engagementId);
    if (contracts === null) {
      contractsWired = false;
    } else {
      ndaSigned = false;
      contracts.forEach((contract) => {
        const type = mapContractType(contract.contract_type ?? contract.name);
        if (type !== 'nda') return;
        if (mapContractStatus(contract.status) === 'signed') {
          ndaSigned = true;
        }
      });
    }

    const outputs = await erpClient.fetchOutputsByProject(engagementId);
    if (outputs === null) {
      outputsWired = false;
    }
    const invoices = await erpClient.fetchInvoicesByProject(engagementId);
    const latestInvoice = await erpClient.fetchLatestInvoice(engagementId);

    const protocolWired = Boolean(project);
    const intelWired = Array.isArray(clientRequests);
    const billingWired = invoices !== null;
    const settlementWired = latestInvoice !== null;
    const opsConsoleWired = Boolean(project);
    const requestBuilderWired = Array.isArray(clientRequests);
    const deliveryPipelineWired = outputsWired;
    const accessRolesWired = Boolean(project);
    const secureChannelWired = Boolean(project);

    const wiredModules: Record<ModuleKey, boolean> = {
      intel: intelWired,
      protocol: protocolWired,
      outputs: outputsWired,
      secureChannel: secureChannelWired,
      contracts: contractsWired,
      billing: billingWired,
      settlement: settlementWired,
      opsConsole: opsConsoleWired,
      requestBuilder: requestBuilderWired,
      deliveryPipeline: deliveryPipelineWired,
      accessRoles: accessRolesWired,
    };

    const baseModules = tier ? tierModuleDefaults[tier] : null;
    const statusGate = status === 'ACTIVE' ? null : `project_${status.toLowerCase()}`;

    const modules = MODULE_ORDER.reduce<Record<ModuleKey, ModuleInfo>>(
      (acc, key) => {
        const base = baseModules?.[key] ?? { state: 'locked', reason: 'tier_unknown' };
        const override = moduleOverrides?.[key];
        const resolvedBase = override ? { ...base, ...override } : base;
        const wired = wiredModules[key];
        let state = wired ? resolvedBase.state : 'not_wired';
        let reason = wired ? resolvedBase.reason : 'not_wired';

        if (statusGate) {
          state = 'locked';
          reason = statusGate;
        }

        if (key === 'contracts' && wired && ndaSigned === true && state === 'action') {
          state = 'active';
          reason = 'nda_signed';
        }

        if (key === 'secureChannel' && wired && state === 'active') {
          state = 'pending';
          reason = 'e2ee_stub';
        }

        const payload: ModuleInfo = { state, reason, wired };
        if (OPERATOR_ONLY_MODULES.has(key)) {
          payload.role = 'operator_only';
        }
        acc[key] = payload;
        return acc;
      },
      {} as Record<ModuleKey, ModuleInfo>,
    );

    return jsonResponse({
      id: engagementId,
      status,
      tier,
      startDate,
      modules,
    });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(500, 'erp_unavailable', 'ERP request failed.');
    }
    return errorResponse(500, 'server_error', 'Unexpected server error.');
  }
}
