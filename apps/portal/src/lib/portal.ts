import { apiFetch } from './api';

export type AuthMeResponse = {
  uid?: string | null;
  role?: string | null;
  engagementIds?: string[] | null;
  visibility?: unknown;
  jti?: string | null;
  scope?: 'ALL' | 'SCOPED';
  user?: { email?: string | null; name?: string | null } | null;
};

export type ModuleState = 'active' | 'pending' | 'locked' | 'action' | 'not_wired';
export type ModuleRole = 'operator_only';

export type ModuleKey =
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

export type ModuleInfo = {
  state: ModuleState;
  reason?: string;
  role?: ModuleRole;
  wired?: boolean;
};

export type EngagementSummaryDTO = {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  tier: 'DIAGNOSIS' | 'ARCHITECT' | 'SOVEREIGN' | null;
  startDate: string | null;
  modules: Record<ModuleKey, ModuleInfo>;
};

export type EngagementListItem = {
  id: string;
  label?: string | null;
  status?: string | null;
  startDate?: string | null;
};

export type EngagementListResponse = {
  items: EngagementListItem[];
};

export type LoginResponse = {
  ok: boolean;
  role: string;
  engagementIds: string[];
  user?: { email?: string | null; name?: string | null } | null;
};

export type SettlementResponse = {
  id: string;
  deliverableId: string;
  amount: number;
  currency: string;
  status: 'paid' | 'unpaid' | 'overdue';
  settledAt?: string;
};

export type ContractStatus = 'signed' | 'pending' | 'action' | 'not_wired';

export type ContractItem = {
  type: 'nda' | 'msa' | 'sow' | 'dpa' | 'change_requests';
  label: string;
  status: ContractStatus;
  updatedAt: string | null;
  attachments: Array<{ id: string; name: string }>;
};

export type ContractsResponse = {
  engagementId: string;
  wired: boolean;
  items: ContractItem[];
  message?: string;
};

export type OutputStatus = 'pending' | 'in_progress' | 'delivered' | 'accepted';

export type OutputItem = {
  id: string;
  title: string;
  category: string;
  status: OutputStatus;
  updatedAt: string | null;
  attachments: Array<{ id: string; name: string; size?: number }>;
};

export type OutputsResponse = {
  engagementId: string;
  wired: boolean;
  items: OutputItem[];
  message?: string;
};

export type SecureChannelStatusResponse = {
  engagementId: string;
  status: 'pending' | 'ready';
  mode: 'e2ee_stub';
  serverPublicKey: string;
  updatedAt: string;
  note?: string;
};

export type SecureMessagesResponse = {
  engagementId: string;
  items: Array<{
    id: string;
    ciphertext: string;
    nonce: string;
    sender: 'client' | 'operator';
    sentAt: string;
  }>;
  nextCursor: string | null;
  mode: 'e2ee_stub';
  note?: string;
};

export type SecureMessagePostResponse = {
  engagementId: string;
  accepted: boolean;
  id: string;
  sentAt: string;
  mode: 'e2ee_stub';
};

export const getEngagementIdFromLocation = (pathname: string): string | null => {
  const match = pathname.match(/\/engagements\/([^/]+)/i);
  return match?.[1] ?? null;
};

export async function fetchAuthMe() {
  return apiFetch<AuthMeResponse>('/api/auth/me');
}

export async function postLogin(payload: { email: string; password: string }) {
  return apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function postInviteAccept(token: string) {
  return apiFetch<{ ok: boolean; user?: { email?: string | null } }>('/api/auth/invite/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

export async function postLogout() {
  return apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export async function fetchEngagements() {
  return apiFetch<EngagementListResponse>('/api/engagements');
}

export async function fetchEngagementSummary(id: string) {
  return apiFetch<EngagementSummaryDTO>(`/api/engagements/${id}/summary`);
}

export async function fetchSettlement(id: string) {
  return apiFetch<SettlementResponse>(`/api/engagements/${id}/settlement`);
}

export async function fetchContracts(id: string) {
  return apiFetch<ContractsResponse>(`/api/engagements/${id}/contracts`);
}

export async function fetchOutputs(id: string) {
  return apiFetch<OutputsResponse>(`/api/engagements/${id}/outputs`);
}

export async function fetchSecureStatus(id: string) {
  return apiFetch<SecureChannelStatusResponse>(`/api/engagements/${id}/secure-channel/status`);
}

export async function postSecureHandshake(id: string, payload: { clientPublicKey: string }) {
  return apiFetch<SecureChannelStatusResponse>(`/api/engagements/${id}/secure-channel/handshake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchSecureMessages(id: string, cursor?: string | null) {
  const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiFetch<SecureMessagesResponse>(
    `/api/engagements/${id}/secure-channel/messages${search}`,
  );
}

export async function postSecureMessage(
  id: string,
  payload: { ciphertext: string; nonce: string; sender: 'client' | 'operator'; sentAt: string },
) {
  return apiFetch<SecureMessagePostResponse>(`/api/engagements/${id}/secure-channel/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export type ProtocolTimelineItem = {
  id: string;
  label: string;
  status: 'complete' | 'in_progress' | 'pending';
  dueDate: string;
  owner: 'client' | 'operator';
};

export type ProtocolTask = {
  id: string;
  label: string;
  status: 'blocked' | 'in_progress' | 'ready' | 'pending';
  owner: 'client' | 'operator';
  eta: string;
};

export type ProtocolResponse = {
  engagementId: string;
  phase: string;
  status: 'in_progress' | 'pending' | 'complete';
  timeline: ProtocolTimelineItem[];
  tasks: ProtocolTask[];
  note?: string;
};

export async function fetchProtocolStatus(id: string) {
  return apiFetch<ProtocolResponse>(`/api/engagements/${id}/protocol`);
}

export type BillingInvoice = {
  id: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  status: 'paid' | 'unpaid' | 'overdue';
  outstanding: number;
  issuedAt: string | null;
  paymentUrl?: string | null;
};

export type BillingResponse = {
  engagementId: string;
  outstandingTotal: number;
  paymentUrl?: string | null;
  invoices: BillingInvoice[];
  note?: string;
};

export async function fetchBilling(id: string) {
  return apiFetch<BillingResponse>(`/api/engagements/${id}/billing`);
}

export type OpsConsoleMetric = {
  label: string;
  value: string;
  trend: 'minor_up' | 'minor_down' | 'steady';
};
export type OpsConsoleAlert = {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  raisedAt: string;
};
export type OpsConsoleResponse = {
  engagementId: string;
  systemStatus: 'nominal' | 'degraded' | 'critical';
  lastSyncAt: string;
  metrics: OpsConsoleMetric[];
  alerts: OpsConsoleAlert[];
};

export async function fetchOpsConsole(id: string) {
  return apiFetch<OpsConsoleResponse>(`/api/engagements/${id}/ops/console`);
}

export type OpsRequestItem = {
  id: string;
  title: string;
  status: string;
  required: boolean;
  visibility: string;
  assignedTo: string;
};

export type OpsRequestsResponse = {
  engagementId: string;
  items: OpsRequestItem[];
};

export async function fetchOpsRequests(id: string) {
  return apiFetch<OpsRequestsResponse>(`/api/engagements/${id}/ops/requests`);
}

export async function postOpsRequestAccept(id: string, requestId: string) {
  return apiFetch<{ ok: boolean; requestId: string; status: string }>(
    `/api/engagements/${id}/ops/requests/${requestId}/accept`,
    { method: 'POST' },
  );
}

export type DeliveryStage = {
  id: string;
  label: string;
  status: 'complete' | 'in_progress' | 'pending';
  owner: 'client' | 'operator';
  updatedAt: string;
};

export type DeliveryPipelineResponse = {
  engagementId: string;
  stages: DeliveryStage[];
  note?: string;
};

export async function fetchDeliveryPipeline(id: string) {
  return apiFetch<DeliveryPipelineResponse>(`/api/engagements/${id}/ops/delivery`);
}

export type AccessRole = {
  role: string;
  assigned: boolean;
  scope: string;
  lastReviewedAt: string | null;
};

export type AccessRolesResponse = {
  engagementId: string;
  roles: AccessRole[];
  note?: string;
};

export async function fetchAccessRoles(id: string) {
  return apiFetch<AccessRolesResponse>(`/api/engagements/${id}/ops/access`);
}
