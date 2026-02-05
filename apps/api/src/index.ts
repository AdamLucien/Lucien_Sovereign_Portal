import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import { authenticateUser, createSessionToken, verifySessionToken } from './auth';
import { consumeInviteToken, createInvite } from './auth-store';
import { sendInviteEmail } from './email';
import { isValidEngagementId, normalizeEngagementIds } from './engagements';
import {
  createErpClient,
  isERPClientError,
  isErpConfigured,
  type ContractRecord,
} from './erp-client';
import { errorPayload, parseJsonBody, type ErrorPayload } from './http';
import { INTEL_TEMPLATES, type IntelField } from './intel-templates';

import type { Env } from './env';

type Role = 'CLIENT' | 'OPERATOR';

type LucienSession = {
  uid: string;
  role: Role;
  engagementIds: string[];
  vis: unknown;
  jti: string;
  iat: number;
  exp: number;
};

const SESSION_COOKIE = 'lucien_session';
const SESSION_TTL = 8 * 60 * 60;

const app = new Hono<{ Bindings: Env; Variables: { session?: LucienSession } }>();

const errorResponse = (status: number, code: string, reason: string, error = 'gateway_error') =>
  errorPayload(status, code, reason, error);

const respondError = (c: Parameters<typeof setCookie>[0], payload: ErrorPayload) => {
  return c.json(payload.body, payload.status);
};

const requireInviteSecret = (env: Env, request: Request) => {
  const secret = env.INVITE_API_SECRET?.trim();
  if (!secret) {
    return errorResponse(500, 'invite_secret_missing', 'Invite secret not configured.');
  }
  const provided = request.headers.get('x-invite-secret');
  if (provided !== secret) {
    return errorResponse(403, 'forbidden', 'Invalid invite secret.');
  }
  return null;
};

const attachSessionCookie = (c: Parameters<typeof setCookie>[0], token: string, maxAge: number) => {
  const isSecure = c.req.url.startsWith('https://');
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge,
    secure: isSecure,
  });
};

const clearSessionCookie = (c: Parameters<typeof setCookie>[0]) => {
  const isSecure = c.req.url.startsWith('https://');
  setCookie(c, SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    secure: isSecure,
  });
};

const readSession = async (c: Parameters<typeof setCookie>[0], env: Env) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  try {
    const payload = await verifySessionToken(token, env.LUCIEN_JWT_SECRET);
    return payload as LucienSession;
  } catch {
    return null;
  }
};

const buildPaymentLink = (
  template: string | undefined,
  params: { invoiceId: string; engagementId: string; returnUrl: string },
) => {
  if (!template) return null;
  return template
    .replaceAll('{invoiceId}', encodeURIComponent(params.invoiceId))
    .replaceAll('{engagementId}', encodeURIComponent(params.engagementId))
    .replaceAll('{returnUrl}', encodeURIComponent(params.returnUrl));
};

const normalizeText = (value?: string | null) => (value ?? '').trim().toLowerCase();

const mapContractType = (
  value?: string | null,
): 'nda' | 'msa' | 'sow' | 'dpa' | 'change_requests' | null => {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.includes('nda')) return 'nda';
  if (text.includes('msa')) return 'msa';
  if (text.includes('sow') || text.includes('annex')) return 'sow';
  if (text.includes('dpa')) return 'dpa';
  if (text.includes('change')) return 'change_requests';
  return null;
};

const mapContractStatus = (value?: string | null): 'signed' | 'pending' | 'action' => {
  const text = normalizeText(value);
  if (!text) return 'pending';
  if (text.includes('signed') || text.includes('executed') || text.includes('active')) {
    return 'signed';
  }
  if (text.includes('action') || text.includes('required')) {
    return 'action';
  }
  return 'pending';
};

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  return next();
});

app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (
    path.startsWith('/api/auth/login') ||
    path.startsWith('/api/auth/logout') ||
    path.startsWith('/api/auth/invite') ||
    path.startsWith('/api/health')
  ) {
    return next();
  }

  const session = await readSession(c, c.env);
  if (!session) {
    return respondError(c, errorResponse(401, 'session_missing', 'Missing lucien_session cookie.'));
  }
  c.set('session', session);
  return next();
});

app.get('/api/health', (c) => {
  return c.json({ ok: true });
});

app.post('/api/auth/login', async (c) => {
  const { data, error } = await parseJsonBody<{ email?: string; password?: string }>(c.req.raw, {
    maxBytes: 10 * 1024,
  });
  if (error) return respondError(c, error);
  const email = data?.email?.trim() ?? '';
  const password = data?.password ?? '';
  if (!email || !password) {
    return respondError(c, errorResponse(400, 'invalid_payload', 'Email and password required.'));
  }

  const user = await authenticateUser(c.env.DB, email, password);
  if (!user) {
    return respondError(c, errorResponse(401, 'invalid_credentials', 'Invalid credentials.'));
  }

  const { token, expiresIn } = await createSessionToken(
    {
      uid: user.email,
      role: user.role as Role,
      engagementIds: user.engagementIds,
      vis: user.vis ?? null,
    },
    c.env.LUCIEN_JWT_SECRET,
    SESSION_TTL,
  );

  attachSessionCookie(c, token, expiresIn);
  return c.json({
    ok: true,
    role: user.role,
    engagementIds: user.engagementIds,
    user: { email: user.email, name: user.name ?? null },
  });
});

app.post('/api/auth/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get('/api/auth/me', async (c) => {
  const session = await readSession(c, c.env);
  if (!session) {
    return respondError(c, errorResponse(401, 'unauthenticated', 'Session required.'));
  }

  return c.json({
    uid: session.uid,
    role: session.role,
    engagementIds: session.engagementIds.includes('ALL') ? [] : session.engagementIds,
    scope: session.engagementIds.includes('ALL') ? 'ALL' : 'SCOPED',
    visibility: session.vis ?? null,
    jti: session.jti,
    user: { email: session.uid },
  });
});

app.post('/api/auth/invite', async (c) => {
  const authError = requireInviteSecret(c.env, c.req.raw);
  if (authError) return respondError(c, authError);

  const { data, error } = await parseJsonBody<{
    email?: string;
    role?: string;
    engagementIds?: string[];
    name?: string | null;
    vis?: unknown;
    type?: 'magic' | 'temp_password';
    expiresInHours?: number;
    sendEmail?: boolean;
    inviteBaseUrl?: string;
  }>(c.req.raw, { maxBytes: 20 * 1024 });
  if (error) return respondError(c, error);

  const email = data?.email?.trim().toLowerCase() ?? '';
  const role = data?.role?.toUpperCase() ?? 'CLIENT';
  const engagementIds = Array.isArray(data?.engagementIds)
    ? normalizeEngagementIds(data!.engagementIds.map((value) => String(value)))
    : [];

  if (!email) {
    return respondError(c, errorResponse(400, 'invalid_payload', 'Valid email required.'));
  }
  if (role !== 'CLIENT' && role !== 'OPERATOR') {
    return respondError(c, errorResponse(400, 'invalid_payload', 'Invalid role.'));
  }
  if (engagementIds.length === 0) {
    return respondError(c, errorResponse(400, 'invalid_payload', 'engagementIds required.'));
  }

  const invalidIds = engagementIds.filter((id) => id !== 'ALL' && !isValidEngagementId(id));
  if (invalidIds.length) {
    return respondError(
      c,
      errorResponse(400, 'invalid_payload', `Invalid engagementIds: ${invalidIds.join(', ')}`),
    );
  }

  const inviteBaseUrl =
    data?.inviteBaseUrl?.trim() ?? c.env.INVITE_BASE_URL?.trim() ?? c.env.PORTAL_BASE_URL?.trim();

  const { invite, token, tempPassword } = await createInvite(c.env.DB, {
    email,
    role,
    engagementIds,
    name: data?.name ?? null,
    vis: data?.vis ?? null,
    type: data?.type ?? 'magic',
    expiresInHours: data?.expiresInHours,
  });

  let inviteLink: string | null = null;
  if (invite.type === 'magic') {
    if (!inviteBaseUrl) {
      return respondError(
        c,
        errorResponse(500, 'invite_base_url_missing', 'Invite base URL missing.'),
      );
    }
    inviteLink = new URL(`/invite?token=${encodeURIComponent(token)}`, inviteBaseUrl).toString();
  }

  const shouldSend = data?.sendEmail !== false;
  let emailSent = false;
  if (shouldSend) {
    await sendInviteEmail(c.env, {
      to: email,
      inviteLink,
      temporaryPassword: tempPassword,
      role: invite.role,
      engagementIds: invite.engagementIds,
      expiresAt: invite.expiresAt,
    });
    emailSent = true;
  }

  return c.json({
    ok: true,
    inviteId: invite.id,
    email: invite.email,
    type: invite.type,
    expiresAt: invite.expiresAt,
    inviteLink,
    emailSent,
    temporaryPassword: shouldSend ? undefined : (tempPassword ?? undefined),
  });
});

app.post('/api/auth/invite/accept', async (c) => {
  const { data, error } = await parseJsonBody<{ token?: string }>(c.req.raw, {
    maxBytes: 4 * 1024,
  });
  if (error) return respondError(c, error);
  const token = data?.token?.trim() ?? '';
  if (!token) {
    return respondError(c, errorResponse(400, 'invalid_payload', 'Invite token required.'));
  }

  const result = await consumeInviteToken(c.env.DB, token);
  if (!result) {
    return respondError(
      c,
      errorResponse(401, 'invalid_invite', 'Invite token invalid or expired.'),
    );
  }

  const { user } = result;
  const { token: sessionToken, expiresIn } = await createSessionToken(
    {
      uid: user.email,
      role: user.role as Role,
      engagementIds: user.engagementIds,
      vis: user.vis ?? null,
    },
    c.env.LUCIEN_JWT_SECRET,
    SESSION_TTL,
  );

  attachSessionCookie(c, sessionToken, expiresIn);
  return c.json({
    ok: true,
    user: {
      email: user.email,
      name: user.name ?? null,
      role: user.role,
      engagementIds: user.engagementIds,
    },
  });
});

app.get('/api/auth/invite/accept', async (c) => {
  const token = c.req.query('token')?.trim() ?? '';
  if (!token) {
    return c.redirect('/login', 302);
  }

  const result = await consumeInviteToken(c.env.DB, token);
  if (!result) {
    return c.redirect('/login', 302);
  }

  const { user } = result;
  const { token: sessionToken, expiresIn } = await createSessionToken(
    {
      uid: user.email,
      role: user.role as Role,
      engagementIds: user.engagementIds,
      vis: user.vis ?? null,
    },
    c.env.LUCIEN_JWT_SECRET,
    SESSION_TTL,
  );

  attachSessionCookie(c, sessionToken, expiresIn);
  return c.redirect('/', 302);
});

const parseScope = (engagementIds: string[]) => {
  if (engagementIds.includes('ALL')) return { all: true, ids: [] as string[] };
  return { all: false, ids: engagementIds };
};

const requireSession = (c: Parameters<typeof setCookie>[0]) => {
  const session = c.get('session');
  if (!session) {
    return { error: errorResponse(401, 'session_missing', 'Missing lucien_session cookie.') };
  }
  return { session };
};

const requireOperator = (session: LucienSession) => {
  if (session.role !== 'OPERATOR') {
    return errorResponse(403, 'forbidden', 'Operator access required.');
  }
  return null;
};

const requireClientGate = async (
  c: Parameters<typeof setCookie>[0],
  engagementId: string,
  options: { billing?: boolean; nda?: boolean },
) => {
  const session = c.get('session') as LucienSession | undefined;
  if (!session || session.role !== 'CLIENT') return null;
  const erpClient = createErpClient(c.env);

  if (options.billing) {
    const latestInvoice = await erpClient.fetchLatestInvoice(engagementId);
    const billingPaid =
      latestInvoice && typeof latestInvoice.outstanding_amount === 'number'
        ? latestInvoice.outstanding_amount <= 0
        : false;
    if (!billingPaid) {
      return errorResponse(402, 'payment_required', 'Billing required before access.');
    }
  }

  if (options.nda) {
    const contracts = await erpClient.fetchContractsByProject(engagementId);
    const ndaSigned = contracts
      ? contracts.some((contract) => {
          const type = mapContractType(contract.contract_type ?? contract.name);
          if (type !== 'nda') return false;
          return mapContractStatus(contract.status) === 'signed';
        })
      : false;
    if (!ndaSigned) {
      return errorResponse(403, 'nda_required', 'NDA must be signed before access.');
    }
  }

  return null;
};

app.get('/api/engagements', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);

  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && scope.ids.length === 0) {
    return respondError(c, errorResponse(403, 'forbidden', 'No engagements available.'));
  }

  const erpClient = createErpClient(c.env);
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
      return c.json({ items });
    }

    const items = scope.ids
      .map((id) => ({ id, label: id, status: null, startDate: null }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return c.json({ items });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(500, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/summary', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  const dataMode = isErpConfigured(c.env) ? 'erp' : 'mock';

  if (!scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }

  const erpClient = createErpClient(c.env);

  type EngagementStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';
  type EngagementTier = 'DIAGNOSIS' | 'ARCHITECT' | 'SOVEREIGN';
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
    DIAGNOSIS: {
      intel: { state: 'active' },
      protocol: { state: 'locked', reason: 'tier_intel_only' },
      outputs: { state: 'locked', reason: 'tier_intel_only' },
      secureChannel: { state: 'locked', reason: 'tier_intel_only' },
      contracts: { state: 'action', reason: 'nda_required' },
      billing: { state: 'active' },
      settlement: { state: 'locked', reason: 'tier_intel_only' },
      opsConsole: { state: 'active' },
      requestBuilder: { state: 'action', reason: 'operator_queue' },
      deliveryPipeline: { state: 'pending', reason: 'pipeline_init' },
      accessRoles: { state: 'locked', reason: 'operator_only' },
    },
    ARCHITECT: {
      intel: { state: 'active' },
      protocol: { state: 'pending', reason: 'kickoff' },
      outputs: { state: 'locked', reason: 'delivery' },
      secureChannel: { state: 'pending', reason: 'key_exchange' },
      contracts: { state: 'action', reason: 'nda_required' },
      billing: { state: 'active' },
      settlement: { state: 'locked', reason: 'final_acceptance' },
      opsConsole: { state: 'active' },
      requestBuilder: { state: 'action', reason: 'operator_queue' },
      deliveryPipeline: { state: 'pending', reason: 'pipeline_init' },
      accessRoles: { state: 'locked', reason: 'operator_only' },
    },
    SOVEREIGN: {
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
    const tierField = c.env.LUCIEN_TIER_FIELD?.trim();
    if (!tierField) return null;
    const raw = project[tierField];
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return null;
    if (
      normalized.includes('diagnosis') ||
      normalized.includes('audit') ||
      normalized.includes('intel')
    ) {
      return 'DIAGNOSIS';
    }
    if (normalized.includes('architect') || normalized.includes('blueprint')) {
      return 'ARCHITECT';
    }
    if (
      normalized.includes('sovereign') ||
      normalized.includes('total control') ||
      normalized.includes('custom')
    ) {
      return 'SOVEREIGN';
    }
    return null;
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

  const isNdaSigned = (records: ContractRecord[] | null) => {
    if (!records || !records.length) return false;
    return records.some((contract) => {
      const type = mapContractType(contract.contract_type ?? contract.name);
      if (type !== 'nda') return false;
      return mapContractStatus(contract.status) === 'signed';
    });
  };

  try {
    const project = await erpClient.fetchProjectById(engagementId);
    if (!project) {
      return respondError(c, errorResponse(404, 'project_not_found', 'Engagement not found.'));
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
      ndaSigned = isNdaSigned(contracts);
    }

    const outputs = await erpClient.fetchOutputsByProject(engagementId);
    if (outputs === null) outputsWired = false;
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

    const modules: Record<ModuleKey, ModuleInfo> = MODULE_ORDER.reduce(
      (acc, key) => {
        const base = tier ? tierModuleDefaults[tier][key] : { state: 'locked' as ModuleState };
        const override = moduleOverrides[key];
        const wired = wiredModules[key];
        const role = OPERATOR_ONLY_MODULES.has(key) ? 'operator_only' : undefined;
        acc[key] = {
          state: override?.state ?? base.state,
          reason: override?.reason ?? base.reason,
          wired,
          role,
        };
        return acc;
      },
      {} as Record<ModuleKey, ModuleInfo>,
    );

    if (ndaSigned === false) {
      modules.contracts.state = 'action';
      modules.contracts.reason = 'nda_required';
    }

    const billingPaid =
      latestInvoice && typeof latestInvoice.outstanding_amount === 'number'
        ? latestInvoice.outstanding_amount <= 0
        : false;

    if (session!.role === 'CLIENT' && !billingPaid) {
      MODULE_ORDER.forEach((key) => {
        if (key === 'billing' || key === 'contracts') return;
        if (modules[key].state === 'not_wired') return;
        modules[key].state = 'locked';
        modules[key].reason = 'billing_required';
      });
      if (modules.billing.state !== 'not_wired') {
        modules.billing.state = 'action';
        modules.billing.reason = 'payment_required';
      }
      if (modules.contracts.state === 'locked') {
        modules.contracts.state = 'action';
        modules.contracts.reason = modules.contracts.reason ?? 'nda_required';
      }
    } else if (session!.role === 'CLIENT' && ndaSigned === false) {
      MODULE_ORDER.forEach((key) => {
        if (key === 'billing' || key === 'contracts') return;
        if (modules[key].state === 'not_wired') return;
        modules[key].state = 'locked';
        modules[key].reason = 'nda_required';
      });
      if (modules.contracts.state === 'locked') {
        modules.contracts.state = 'action';
        modules.contracts.reason = 'nda_required';
      }
    }

    return c.json({
      id: engagementId,
      status,
      tier,
      startDate,
      modules,
    });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(502, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/intel', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  const gate = await requireClientGate(c, engagementId, { billing: true, nda: true });
  if (gate) return respondError(c, gate);

  const erpClient = createErpClient(c.env);
  const filterFieldsByRole = (fields: IntelField[], role: string | null) => {
    if (role !== 'CLIENT') return fields;
    return fields.filter((field) => !field.visibility || field.visibility === 'client_visible');
  };

  try {
    const requests = await erpClient.fetchClientRequestsByProject(engagementId);
    const sortedRequests = [...requests].sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      const statusCompare = a.status.localeCompare(b.status);
      if (statusCompare !== 0) return statusCompare;
      return a.name.localeCompare(b.name);
    });

    const responses = await Promise.all(
      sortedRequests.map(async (record) => {
        if (session!.role === 'CLIENT' && record.visibility !== 'client_visible') {
          return null;
        }
        const template = INTEL_TEMPLATES[record.template_key];
        const fields = template ? filterFieldsByRole(template.fields, session!.role) : [];
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

    return c.json(responses.filter(Boolean));
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(502, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.post('/api/engagements/:id/intel/upload', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);

  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  const gate = await requireClientGate(c, engagementId, { billing: true, nda: true });
  if (gate) return respondError(c, gate);

  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return respondError(
      c,
      errorResponse(400, 'invalid_content_type', 'Expected multipart/form-data.'),
    );
  }

  const contentLength = Number(c.req.header('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return respondError(c, errorResponse(411, 'length_required', 'Content-Length required.'));
  }
  if (contentLength > 50 * 1024 * 1024) {
    return respondError(c, errorResponse(413, 'payload_too_large', 'Upload exceeds 50MB.'));
  }

  const formData = await c.req.raw.formData();
  const file = formData.get('file');
  const requestId = formData.get('requestId');
  if (!(file instanceof File)) {
    return respondError(c, errorResponse(400, 'invalid_file', 'File is required.'));
  }
  if (file.size > 50 * 1024 * 1024) {
    return respondError(c, errorResponse(413, 'payload_too_large', 'Upload exceeds 50MB.'));
  }
  if (typeof requestId !== 'string' || !/^REQ-[0-9A-Z-]+$/.test(requestId)) {
    return respondError(c, errorResponse(400, 'invalid_request_id', 'Invalid requestId.'));
  }

  const erpClient = createErpClient(c.env);
  try {
    const clientRequest = await erpClient.fetchClientRequestById(requestId);
    if (!clientRequest) {
      return respondError(c, errorResponse(403, 'request_not_found', 'Request not found.'));
    }
    if (clientRequest.project !== engagementId) {
      return respondError(c, errorResponse(403, 'forbidden', 'Engagement mismatch.'));
    }
    if (session!.role === 'CLIENT') {
      if (clientRequest.visibility !== 'client_visible') {
        return respondError(c, errorResponse(403, 'forbidden', 'Request not visible.'));
      }
      if (clientRequest.status === 'accepted') {
        return respondError(c, errorResponse(403, 'forbidden', 'Request already accepted.'));
      }
    }
    const uploadResponse = await erpClient.uploadFile({
      file,
      doctype: 'Client Request',
      docname: clientRequest.name,
    });
    await erpClient.updateClientRequestStatus(clientRequest.name, 'submitted');

    return c.json({
      requestId: clientRequest.name,
      uploadId: uploadResponse.file.name,
      status: 'accepted',
      receivedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(502, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/outputs', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  const gate = await requireClientGate(c, engagementId, { billing: true, nda: true });
  if (gate) return respondError(c, gate);

  const erpClient = createErpClient(c.env);
  const normalize = (value?: string | null) => (value ?? '').trim().toLowerCase();
  const mapStatus = (value?: string | null) => {
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

  try {
    const records = await erpClient.fetchOutputsByProject(engagementId);
    if (!records) {
      return c.json({
        engagementId,
        wired: false,
        message: 'Outputs doctype not wired.',
        items: [],
      });
    }
    const items = records.map((record) => ({
      id: record.name,
      title: record.title ?? record.name,
      category: record.category ?? 'output',
      status: mapStatus(record.status),
      updatedAt: record.modified ?? null,
      attachments: [],
    }));
    items.sort((a, b) => {
      const diff = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
    return c.json({ engagementId, wired: true, items });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(500, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/contracts', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }

  const erpClient = createErpClient(c.env);
  const normalize = (value?: string | null) => (value ?? '').trim().toLowerCase();
  const mapType = (
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
  const mapStatus = (value?: string | null): 'signed' | 'pending' | 'action' => {
    const text = normalize(value);
    if (!text) return 'pending';
    if (text.includes('signed') || text.includes('executed') || text.includes('active'))
      return 'signed';
    if (text.includes('action') || text.includes('required')) return 'action';
    return 'pending';
  };
  const toTimestamp = (value?: string) => {
    if (!value) return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  try {
    const records = await erpClient.fetchContractsByProject(engagementId);
    if (!records) {
      return c.json({
        engagementId,
        wired: false,
        message: 'Contracts doctype not wired.',
        items: [],
      });
    }
    const items = records
      .map((record) => {
        const type = mapType(record.contract_type ?? record.name);
        if (!type) return null;
        return {
          type,
          label: record.contract_type ?? record.name,
          status: mapStatus(record.status),
          updatedAt: record.modified ?? null,
          attachments: [],
        };
      })
      .filter(Boolean) as Array<{
      type: string;
      label: string;
      status: string;
      updatedAt: string | null;
      attachments: Array<{ id: string; name: string }>;
    }>;
    items.sort((a, b) => {
      const diff = toTimestamp(b.updatedAt ?? undefined) - toTimestamp(a.updatedAt ?? undefined);
      if (diff !== 0) return diff;
      return a.type.localeCompare(b.type);
    });
    return c.json({ engagementId, wired: true, items });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(500, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/protocol', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  const gate = await requireClientGate(c, engagementId, { billing: true, nda: true });
  if (gate) return respondError(c, gate);

  const erpClient = createErpClient(c.env);
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
  const buildTimeline = (startDate: string | null): TimelineEntry[] => {
    const baseline = startDate ? new Date(startDate) : new Date();
    const endOfMonth = (date: Date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const month1 = endOfMonth(baseline);
    const month2 = endOfMonth(
      new Date(Date.UTC(month1.getUTCFullYear(), month1.getUTCMonth() + 1, 1)),
    );
    const month3 = endOfMonth(
      new Date(Date.UTC(month2.getUTCFullYear(), month2.getUTCMonth() + 1, 1)),
    );
    return [
      {
        id: 'kickoff',
        label: 'Stabilization month 1',
        status: 'complete',
        dueDate: month1.toISOString(),
        owner: 'operator',
      },
      {
        id: 'design',
        label: 'Stabilization month 2',
        status: 'in_progress',
        dueDate: month2.toISOString(),
        owner: 'operator',
      },
      {
        id: 'handover',
        label: 'Stabilization month 3',
        status: 'pending',
        dueDate: month3.toISOString(),
        owner: 'client',
      },
    ];
  };

  try {
    const project = await erpClient.fetchProjectById(engagementId);
    if (!project) {
      return respondError(c, errorResponse(404, 'project_not_found', 'Engagement not found.'));
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
    return c.json({
      engagementId,
      phase: 'Protocol Integration',
      status: 'in_progress',
      timeline,
      tasks,
      note: 'Live telemetry will appear once design artifacts are signed off.',
    });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(500, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/settlement', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  const gate = await requireClientGate(c, engagementId, { billing: true, nda: true });
  if (gate) return respondError(c, gate);
  const erpClient = createErpClient(c.env);

  try {
    const latestInvoice = await erpClient.fetchLatestInvoice(engagementId);
    if (!latestInvoice) {
      return respondError(c, errorResponse(403, 'invoice_not_found', 'Invoice not found.'));
    }

    const outstanding = latestInvoice.outstanding_amount;
    const status = outstanding <= 0 ? 'paid' : 'unpaid';
    return c.json({
      id: engagementId,
      deliverableId: latestInvoice.name,
      amount: latestInvoice.grand_total,
      currency: latestInvoice.currency,
      status,
      settledAt: latestInvoice.posting_date ?? null,
    });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(500, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/billing', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  const erpClient = createErpClient(c.env);
  const origin = new URL(c.req.url).origin;
  const returnUrl = `${c.env.PORTAL_BASE_URL?.trim() || origin}/billing`;
  const paymentTemplate = c.env.PAYMENT_LINK_TEMPLATE?.trim();

  try {
    const invoices = await erpClient.fetchInvoicesByProject(engagementId);
    if (invoices === null) {
      return c.json({
        engagementId,
        outstandingTotal: 0,
        invoices: [],
        note: 'Billing doctype not wired.',
      });
    }
    const now = Date.now();
    const items = invoices.map((invoice) => {
      const dueAt = invoice.due_date ? Date.parse(invoice.due_date) : null;
      const outstanding = invoice.outstanding_amount ?? 0;
      const isPaid = outstanding <= 0;
      const isOverdue = !isPaid && dueAt !== null && dueAt < now;
      const paymentUrl =
        invoice.payment_url ??
        buildPaymentLink(paymentTemplate, {
          invoiceId: invoice.name,
          engagementId,
          returnUrl,
        });
      return {
        id: invoice.name,
        amount: invoice.grand_total,
        currency: invoice.currency,
        dueDate: invoice.due_date ?? null,
        status: isPaid ? 'paid' : isOverdue ? 'overdue' : 'unpaid',
        outstanding,
        issuedAt: invoice.posting_date ?? null,
        paymentUrl,
      };
    });
    const outstandingTotal = items.reduce((total, invoice) => total + invoice.outstanding, 0);
    const primaryPaymentUrl =
      items.find((invoice) => invoice.status !== 'paid')?.paymentUrl ?? null;
    return c.json({
      engagementId,
      outstandingTotal,
      paymentUrl: primaryPaymentUrl,
      invoices: items,
      note: 'Invoices reflect ERP Sales Invoice entries.',
    });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(500, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/ops/requests', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const operatorError = requireOperator(session!);
  if (operatorError) return respondError(c, operatorError);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  const erpClient = createErpClient(c.env);
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
    return c.json({ engagementId, items });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(502, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.post('/api/engagements/:id/ops/requests/:requestId/accept', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const operatorError = requireOperator(session!);
  if (operatorError) return respondError(c, operatorError);
  const engagementId = c.req.param('id');
  const requestId = c.req.param('requestId');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  if (!/^REQ-[0-9A-Z-]+$/.test(requestId)) {
    return respondError(c, errorResponse(400, 'invalid_request_id', 'Invalid requestId.'));
  }

  const erpClient = createErpClient(c.env);
  try {
    const clientRequest = await erpClient.fetchClientRequestById(requestId);
    if (!clientRequest) {
      return respondError(c, errorResponse(404, 'request_not_found', 'Request not found.'));
    }
    if (clientRequest.project !== engagementId) {
      return respondError(c, errorResponse(403, 'forbidden', 'Engagement mismatch.'));
    }

    if (clientRequest.status !== 'accepted') {
      await erpClient.updateClientRequestStatus(clientRequest.name, 'accepted');
    }

    return c.json({
      ok: true,
      requestId: clientRequest.name,
      status: 'accepted',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (isERPClientError(err)) {
      return respondError(c, errorResponse(502, 'erp_unavailable', 'ERP request failed.'));
    }
    return respondError(c, errorResponse(500, 'server_error', 'Unexpected server error.'));
  }
});

app.get('/api/engagements/:id/ops/access', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const operatorError = requireOperator(session!);
  if (operatorError) return respondError(c, operatorError);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  return c.json({
    engagementId,
    roles: [
      { role: 'OPERATOR', assigned: true, scope: 'ALL', lastReviewedAt: new Date().toISOString() },
      {
        role: 'CLIENT_LEAD',
        assigned: session!.role === 'CLIENT',
        scope: scope.all ? 'ALL' : scope.ids.join(',') || 'SCOPED',
        lastReviewedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      { role: 'AUDITOR', assigned: false, scope: 'READ_ONLY', lastReviewedAt: null },
    ],
    note: 'Role bindings derive from LDAP in production; current data is simulated.',
  });
});

app.get('/api/engagements/:id/ops/console', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const operatorError = requireOperator(session!);
  if (operatorError) return respondError(c, operatorError);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  return c.json({
    engagementId,
    alerts: [
      { id: 'OPS-001', label: 'Credential refresh required', severity: 'high' },
      { id: 'OPS-002', label: 'Intel review pending', severity: 'medium' },
    ],
    note: 'Ops console data is simulated in this build.',
  });
});

app.get('/api/engagements/:id/ops/delivery', async (c) => {
  const { session, error } = requireSession(c);
  if (error) return respondError(c, error);
  const operatorError = requireOperator(session!);
  if (operatorError) return respondError(c, operatorError);
  const engagementId = c.req.param('id');
  const scope = parseScope(session!.engagementIds);
  if (session!.role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return respondError(c, errorResponse(403, 'forbidden', 'Engagement access denied.'));
  }
  return c.json({
    engagementId,
    pipeline: [
      {
        id: 'PIPE-1',
        label: 'Initial analysis',
        status: 'complete',
        updatedAt: new Date().toISOString(),
        owner: 'operator',
      },
      {
        id: 'PIPE-2',
        label: 'Blueprint delivery',
        status: 'in_progress',
        updatedAt: new Date().toISOString(),
        owner: 'operator',
      },
    ],
  });
});

app.get('/api/engagements/:id/secure-channel/status', async (c) => {
  return respondError(
    c,
    errorResponse(501, 'secure_channel_disabled', 'Secure channel is disabled in production.'),
  );
});

app.post('/api/engagements/:id/secure-channel/handshake', async (c) => {
  return respondError(
    c,
    errorResponse(501, 'secure_channel_disabled', 'Secure channel is disabled in production.'),
  );
});

app.get('/api/engagements/:id/secure-channel/messages', async (c) => {
  return respondError(
    c,
    errorResponse(501, 'secure_channel_disabled', 'Secure channel is disabled in production.'),
  );
});

app.post('/api/engagements/:id/secure-channel/messages', async (c) => {
  return respondError(
    c,
    errorResponse(501, 'secure_channel_disabled', 'Secure channel is disabled in production.'),
  );
});

export default app;
