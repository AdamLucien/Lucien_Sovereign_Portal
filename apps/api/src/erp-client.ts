export interface ClientRequestRecord {
  name: string;
  project: string;
  title: string;
  description?: string;
  status: string;
  required: boolean;
  template_key: string;
  visibility?: string;
}

export interface FileRecord {
  name: string;
  file_name: string;
  file_url: string;
  is_private: boolean;
  attached_to_name?: string;
}

export interface UploadFileRequest {
  file: File;
  doctype: string;
  docname: string;
}

export interface UploadFileResponse {
  file: FileRecord;
}

export interface DirectiveRecord {
  name: string;
  project: string;
  pinned: boolean;
  visibility: string;
  requires_ack: boolean;
  ack_by?: string | null;
  ack_at?: string | null;
}

export interface SalesInvoiceRecord {
  name: string;
  project: string;
  outstanding_amount: number;
  due_date: string;
  currency: string;
  grand_total: number;
  posting_date?: string;
  payment_url?: string;
}

export interface ProjectRecord {
  name: string;
  status?: string;
  expected_start_date?: string;
  actual_start_date?: string;
  project_name?: string;
  [key: string]: unknown;
}

export interface ContractRecord {
  name: string;
  project?: string;
  contract_type?: string;
  status?: string;
  modified?: string;
}

export interface OutputRecord {
  name: string;
  project?: string;
  title?: string;
  category?: string;
  status?: string;
  modified?: string;
}

export interface ERPClient {
  fetchProjectById(projectId: string): Promise<ProjectRecord | null>;
  fetchProjects(): Promise<ProjectRecord[]>;
  fetchClientRequestsByProject(projectId: string): Promise<ClientRequestRecord[]>;
  fetchClientRequestById(requestId: string): Promise<ClientRequestRecord | null>;
  fetchFileAttachmentsForRequest(requestId: string): Promise<FileRecord[]>;
  uploadFile(payload: UploadFileRequest): Promise<UploadFileResponse>;
  updateClientRequestStatus(requestId: string, status: string): Promise<void>;
  fetchDirectiveById(directiveId: string): Promise<DirectiveRecord | null>;
  updateDirectiveAck(
    directiveId: string,
    payload: { ack_by: string; ack_at: string },
  ): Promise<void>;
  fetchLatestInvoice(projectId: string): Promise<SalesInvoiceRecord | null>;
  fetchInvoicesByProject(projectId: string): Promise<SalesInvoiceRecord[] | null>;
  fetchContractsByProject(projectId: string): Promise<ContractRecord[] | null>;
  fetchOutputsByProject(projectId: string): Promise<OutputRecord[] | null>;
}

export class ERPClientError extends Error {
  status: number;
  code: string;

  constructor(message = 'ERP request failed.', status = 502, code = 'erp_unavailable') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const isERPClientError = (error: unknown): error is ERPClientError => {
  return error instanceof ERPClientError;
};

export type ERPEnv = {
  ERP_BASE_URL?: string;
  ERP_API_KEY?: string;
  ERP_API_SECRET?: string;
  LUCIEN_TIER_FIELD?: string;
};

const ERP_TIMEOUT_MS = 10_000;

export const isErpConfigured = (env: ERPEnv) =>
  Boolean(env.ERP_BASE_URL && env.ERP_API_KEY && env.ERP_API_SECRET);

export const createErpClient = (env: ERPEnv): ERPClient => {
  const ERP_BASE_URL = env.ERP_BASE_URL;
  const ERP_API_KEY = env.ERP_API_KEY;
  const ERP_API_SECRET = env.ERP_API_SECRET;
  const LUCIEN_TIER_FIELD = env.LUCIEN_TIER_FIELD?.trim();

  const isConfigured = () => Boolean(ERP_BASE_URL && ERP_API_KEY && ERP_API_SECRET);

  const PROJECT_BASE_FIELDS = [
    'name',
    'status',
    'expected_start_date',
    'actual_start_date',
    'project_name',
  ];
  const PROJECT_FIELDS = LUCIEN_TIER_FIELD
    ? Array.from(new Set([...PROJECT_BASE_FIELDS, LUCIEN_TIER_FIELD]))
    : PROJECT_BASE_FIELDS;

  const buildErpUrl = (path: string) => {
    const base = ERP_BASE_URL?.replace(/\/$/, '') ?? '';
    if (!base) return path;
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const resourcePath = (doctype: string) => `/api/resource/${encodeURIComponent(doctype)}`;

  const erpFetch = async (path: string, init?: RequestInit) => {
    if (!isConfigured()) {
      throw new ERPClientError('ERP not configured.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ERP_TIMEOUT_MS);

    try {
      const response = await fetch(buildErpUrl(path), {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `token ${ERP_API_KEY}:${ERP_API_SECRET}`,
          ...(init?.headers ?? {}),
        },
      });

      if (!response.ok) {
        throw new ERPClientError('ERP request failed.', response.status);
      }

      return response;
    } catch (error) {
      if (error instanceof ERPClientError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ERPClientError('ERP request timed out.');
      }
      throw new ERPClientError('ERP request failed.');
    } finally {
      clearTimeout(timeout);
    }
  };

  const erpJson = async (path: string, init?: RequestInit) => {
    const response = await erpFetch(path, init);
    const payload = await response.json().catch(() => null);
    if (!payload) {
      throw new ERPClientError('ERP response invalid.');
    }
    return payload;
  };

  const parseResourceList = <T>(payload: unknown): T[] => {
    if (!payload || typeof payload !== 'object') return [];
    const data = (payload as { data?: T[] }).data;
    return Array.isArray(data) ? data : [];
  };

  const parseResourceItem = <T>(payload: unknown): T | null => {
    if (!payload || typeof payload !== 'object') return null;
    return ((payload as { data?: T }).data as T) ?? null;
  };

  if (!isConfigured()) {
    return mockErpClient;
  }

  return {
    async fetchProjects() {
      const params = new URLSearchParams({
        fields: JSON.stringify(PROJECT_FIELDS),
        order_by: 'modified desc',
        limit_page_length: '200',
      });

      const payload = await erpJson(`${resourcePath('Project')}?${params}`);
      return parseResourceList<ProjectRecord>(payload);
    },
    async fetchProjectById(projectId: string) {
      try {
        const payload = await erpJson(
          `${resourcePath('Project')}/${encodeURIComponent(projectId)}`,
        );
        return parseResourceItem<ProjectRecord>(payload);
      } catch (error) {
        if (error instanceof ERPClientError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    async fetchClientRequestsByProject(projectId: string) {
      const params = new URLSearchParams({
        filters: JSON.stringify([['project', '=', projectId]]),
        fields: JSON.stringify([
          'name',
          'project',
          'title',
          'description',
          'status',
          'required',
          'template_key',
          'visibility',
        ]),
      });

      const payload = await erpJson(`${resourcePath('Client Request')}?${params}`);
      return parseResourceList<ClientRequestRecord>(payload);
    },
    async fetchClientRequestById(requestId: string) {
      const payload = await erpJson(
        `${resourcePath('Client Request')}/${encodeURIComponent(requestId)}`,
      );
      return parseResourceItem<ClientRequestRecord>(payload);
    },
    async fetchFileAttachmentsForRequest(requestId: string) {
      const params = new URLSearchParams({
        filters: JSON.stringify([['attached_to_name', '=', requestId]]),
        fields: JSON.stringify(['name', 'file_name', 'file_url', 'is_private', 'attached_to_name']),
      });

      const payload = await erpJson(`${resourcePath('File')}?${params}`);
      return parseResourceList<FileRecord>(payload);
    },
    async uploadFile(payload: UploadFileRequest) {
      const formData = new FormData();
      formData.append('file', payload.file);
      formData.append('doctype', payload.doctype);
      formData.append('docname', payload.docname);

      const response = await erpFetch('/api/method/upload_file', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => null);
      const message = data?.message as Partial<FileRecord> | undefined;

      if (!message || !message.name) {
        throw new ERPClientError('ERP upload failed.');
      }

      return {
        file: {
          name: message.name,
          file_name: message.file_name ?? payload.file.name,
          file_url: message.file_url ?? '',
          is_private: Boolean(message.is_private),
          attached_to_name: payload.docname,
        },
      };
    },
    async updateClientRequestStatus(requestId: string, status: string) {
      await erpFetch(`${resourcePath('Client Request')}/${encodeURIComponent(requestId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
    },
    async fetchDirectiveById(directiveId: string) {
      const payload = await erpJson(
        `${resourcePath('Directive')}/${encodeURIComponent(directiveId)}`,
      );
      return parseResourceItem<DirectiveRecord>(payload);
    },
    async updateDirectiveAck(directiveId: string, payload: { ack_by: string; ack_at: string }) {
      await erpFetch(`${resourcePath('Directive')}/${encodeURIComponent(directiveId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    },
    async fetchLatestInvoice(projectId: string) {
      try {
        const params = new URLSearchParams({
          filters: JSON.stringify([['project', '=', projectId]]),
          fields: JSON.stringify([
            'name',
            'project',
            'outstanding_amount',
            'due_date',
            'currency',
            'grand_total',
            'posting_date',
            'payment_url',
          ]),
          order_by: 'creation desc',
          limit_page_length: '1',
        });

        const payload = await erpJson(`${resourcePath('Sales Invoice')}?${params}`);
        const invoices = parseResourceList<SalesInvoiceRecord>(payload);
        return invoices[0] ?? null;
      } catch (error) {
        if (error instanceof ERPClientError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    async fetchInvoicesByProject(projectId: string) {
      try {
        const params = new URLSearchParams({
          filters: JSON.stringify([['project', '=', projectId]]),
          fields: JSON.stringify([
            'name',
            'project',
            'outstanding_amount',
            'due_date',
            'currency',
            'grand_total',
            'posting_date',
            'payment_url',
          ]),
          order_by: 'creation desc',
          limit_page_length: '50',
        });

        const payload = await erpJson(`${resourcePath('Sales Invoice')}?${params}`);
        return parseResourceList<SalesInvoiceRecord>(payload);
      } catch (error) {
        if (error instanceof ERPClientError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    async fetchContractsByProject(projectId: string) {
      try {
        const params = new URLSearchParams({
          filters: JSON.stringify([['project', '=', projectId]]),
          fields: JSON.stringify(['name', 'project', 'contract_type', 'status', 'modified']),
        });
        const payload = await erpJson(`${resourcePath('Contract')}?${params}`);
        return parseResourceList<ContractRecord>(payload);
      } catch (error) {
        if (error instanceof ERPClientError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    async fetchOutputsByProject(projectId: string) {
      try {
        const params = new URLSearchParams({
          filters: JSON.stringify([['project', '=', projectId]]),
          fields: JSON.stringify(['name', 'project', 'title', 'category', 'status', 'modified']),
        });
        const payload = await erpJson(`${resourcePath('Deliverable')}?${params}`);
        return parseResourceList<OutputRecord>(payload);
      } catch (error) {
        if (error instanceof ERPClientError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
  };
};

const mockClientRequests: ClientRequestRecord[] = [
  {
    name: 'REQ-2026-0001',
    project: 'PRJ-001',
    title: 'Diagnostic Intake Core',
    description: 'Initial intake request for diagnostic assessment.',
    status: 'pending',
    required: true,
    template_key: 'diag_intake_core_v1',
    visibility: 'client_visible',
  },
  {
    name: 'REQ-2026-0002',
    project: 'PRJ-001',
    title: 'Evidence Upload',
    description: 'Upload supporting evidence for diagnostics.',
    status: 'needs_revision',
    required: false,
    template_key: 'diag_evidence_upload_v1',
    visibility: 'client_visible',
  },
];

const mockFiles: FileRecord[] = [];

const mockProjects: ProjectRecord[] = [
  {
    name: 'PRJ-001',
    status: 'Open',
    expected_start_date: '2026-01-20',
    tier: 'BLUEPRINT',
    lucien_modules: {
      protocol: { state: 'active' },
      outputs: { state: 'active' },
      secureChannel: { state: 'pending', reason: 'e2ee_stub' },
      contracts: { state: 'active' },
      billing: { state: 'active' },
      settlement: { state: 'active' },
      opsConsole: { state: 'active' },
      requestBuilder: { state: 'active' },
      deliveryPipeline: { state: 'pending', reason: 'pipeline_init' },
      accessRoles: { state: 'active' },
    },
  },
];

const mockDirectives: DirectiveRecord[] = [
  {
    name: 'DIR-2026-0001',
    project: 'PRJ-001',
    pinned: true,
    visibility: 'client_visible',
    requires_ack: true,
    ack_by: null,
    ack_at: null,
  },
];

const mockInvoices: SalesInvoiceRecord[] = [
  {
    name: 'SINV-2026-0001',
    project: 'PRJ-001',
    outstanding_amount: 0,
    due_date: '2026-03-15',
    currency: 'EUR',
    grand_total: 7500,
    posting_date: '2026-01-20',
  },
  {
    name: 'SINV-2026-0002',
    project: 'PRJ-001',
    outstanding_amount: 3200,
    due_date: '2026-04-01',
    currency: 'USD',
    grand_total: 9500,
    posting_date: '2026-02-10',
  },
];

const mockContracts: ContractRecord[] = [
  {
    name: 'CON-2026-0001',
    project: 'PRJ-001',
    contract_type: 'NDA',
    status: 'Signed',
    modified: '2026-01-25',
  },
  {
    name: 'CON-2026-0002',
    project: 'PRJ-001',
    contract_type: 'MSA',
    status: 'Active',
    modified: '2026-01-28',
  },
];

const mockOutputs: OutputRecord[] = [
  {
    name: 'OUT-2026-0001',
    project: 'PRJ-001',
    title: 'Risk baseline assessment',
    category: 'report',
    status: 'Delivered',
    modified: '2026-01-29',
  },
];

const mockErpClient: ERPClient = {
  async fetchProjects() {
    return mockProjects;
  },
  async fetchProjectById(projectId: string) {
    return mockProjects.find((project) => project.name === projectId) ?? null;
  },
  async fetchClientRequestsByProject(projectId: string) {
    return mockClientRequests.filter((request) => request.project === projectId);
  },
  async fetchClientRequestById(requestId: string) {
    return mockClientRequests.find((request) => request.name === requestId) ?? null;
  },
  async fetchFileAttachmentsForRequest(requestId: string) {
    return mockFiles.filter((file) => file.attached_to_name === requestId);
  },
  async uploadFile(payload: UploadFileRequest) {
    const mockFile: FileRecord = {
      name: `FILE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      file_name: payload.file.name,
      file_url: `/files/${payload.file.name}`,
      is_private: false,
      attached_to_name: payload.docname,
    };
    mockFiles.push(mockFile);
    return { file: mockFile };
  },
  async updateClientRequestStatus(requestId: string, status: string) {
    const target = mockClientRequests.find((request) => request.name === requestId);
    if (target) target.status = status;
  },
  async fetchDirectiveById(directiveId: string) {
    return mockDirectives.find((directive) => directive.name === directiveId) ?? null;
  },
  async updateDirectiveAck(directiveId: string, payload: { ack_by: string; ack_at: string }) {
    const target = mockDirectives.find((directive) => directive.name === directiveId);
    if (target) {
      target.ack_by = payload.ack_by;
      target.ack_at = payload.ack_at;
    }
  },
  async fetchLatestInvoice(projectId: string) {
    const filtered = mockInvoices.filter((invoice) => invoice.project === projectId);
    return filtered[0] ?? null;
  },
  async fetchInvoicesByProject(projectId: string) {
    return mockInvoices.filter((invoice) => invoice.project === projectId);
  },
  async fetchContractsByProject(projectId: string) {
    return mockContracts.filter((contract) => contract.project === projectId);
  },
  async fetchOutputsByProject(projectId: string) {
    return mockOutputs.filter((output) => output.project === projectId);
  },
};
