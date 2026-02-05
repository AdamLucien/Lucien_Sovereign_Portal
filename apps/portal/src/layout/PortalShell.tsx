import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiResponseError } from '../lib/api';
import {
  fetchAuthMe,
  fetchEngagements,
  fetchEngagementSummary,
  getEngagementIdFromLocation,
  postLogout,
  type EngagementListItem,
  type EngagementSummaryDTO,
  type ModuleKey,
  type ModuleState,
} from '../lib/portal';
import { glow, label, surface, text } from '../styles/tokens';

type Role = 'CLIENT' | 'OPERATOR';

type NavItem = {
  label: string;
  path: string;
  moduleKey?: ModuleKey;
  fallbackState?: ModuleState;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const clientGroups: NavGroup[] = [
  {
    title: 'OVERVIEW',
    items: [{ label: 'OVERVIEW', path: '/', fallbackState: 'active' }],
  },
  {
    title: 'INPUTS',
    items: [
      {
        label: 'INTEL INTAKE',
        path: '/engagements/:id/intel',
        moduleKey: 'intel',
        fallbackState: 'active',
      },
    ],
  },
  {
    title: 'DELIVERY',
    items: [
      {
        label: 'PROTOCOL',
        path: '/protocol',
        moduleKey: 'protocol',
        fallbackState: 'locked',
      },
      {
        label: 'OUTPUTS',
        path: '/outputs',
        moduleKey: 'outputs',
        fallbackState: 'locked',
      },
    ],
  },
  {
    title: 'COMMS',
    items: [
      {
        label: 'SECURE CHANNEL',
        path: '/secure-channel',
        moduleKey: 'secureChannel',
        fallbackState: 'locked',
      },
    ],
  },
  {
    title: 'LEGAL',
    items: [
      {
        label: 'CONTRACTS',
        path: '/contracts',
        moduleKey: 'contracts',
        fallbackState: 'action',
      },
    ],
  },
  {
    title: 'BILLING',
    items: [
      {
        label: 'BILLING',
        path: '/billing',
        moduleKey: 'billing',
        fallbackState: 'locked',
      },
    ],
  },
  {
    title: 'CLOSE',
    items: [
      {
        label: 'SETTLEMENT',
        path: '/settlement',
        moduleKey: 'settlement',
        fallbackState: 'locked',
      },
    ],
  },
];

const operatorGroups: NavGroup[] = [
  ...clientGroups,
  {
    title: 'OPS',
    items: [
      {
        label: 'OPS CONSOLE',
        path: '/ops',
        moduleKey: 'opsConsole',
        fallbackState: 'locked',
      },
      {
        label: 'REQUEST BUILDER',
        path: '/ops/requests',
        moduleKey: 'requestBuilder',
        fallbackState: 'locked',
      },
    ],
  },
  {
    title: 'DELIVERY OPS',
    items: [
      {
        label: 'DELIVERY PIPELINE',
        path: '/ops/delivery',
        moduleKey: 'deliveryPipeline',
        fallbackState: 'locked',
      },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      {
        label: 'ACCESS & ROLES',
        path: '/ops/access',
        moduleKey: 'accessRoles',
        fallbackState: 'locked',
      },
    ],
  },
];

type PortalShellProps = {
  children: ReactNode;
};

type PortalContextValue = {
  role: Role;
  engagementId: string | null;
  summary: EngagementSummaryDTO | null;
  summaryLoading: boolean;
  summaryError: string | null;
};

const PortalContext = createContext<PortalContextValue>({
  role: 'CLIENT',
  engagementId: null,
  summary: null,
  summaryLoading: false,
  summaryError: null,
});

export const usePortalRole = () => useContext(PortalContext).role;
export const usePortalContext = () => useContext(PortalContext);

export default function PortalShell({ children }: PortalShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('CLIENT');
  const [engagementIds, setEngagementIds] = useState<string[]>([]);
  const [availableEngagements, setAvailableEngagements] = useState<EngagementListItem[]>([]);
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('lucien_selected_engagement');
  });
  const [authScope, setAuthScope] = useState<'ALL' | 'SCOPED'>('SCOPED');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [summary, setSummary] = useState<EngagementSummaryDTO | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const engagementIdFromPath = useMemo(() => {
    return getEngagementIdFromLocation(location.pathname);
  }, [location.pathname]);
  const availableIds = useMemo(
    () => availableEngagements.map((item) => item.id),
    [availableEngagements],
  );
  const resolvedSelectedId =
    selectedEngagementId && availableIds.includes(selectedEngagementId)
      ? selectedEngagementId
      : null;
  const engagementId = engagementIdFromPath ?? resolvedSelectedId ?? availableIds[0] ?? null;

  useEffect(() => {
    let active = true;
    setAuthLoading(true);
    setAuthError(null);
    fetchAuthMe()
      .then((data) => {
        if (!active) return;
        const nextRole =
          String(data?.role ?? '').toUpperCase() === 'OPERATOR' ? 'OPERATOR' : 'CLIENT';
        setRole(nextRole);
        const ids = Array.isArray(data?.engagementIds)
          ? data.engagementIds
              .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
              .sort()
          : [];
        setEngagementIds(ids);
        setAuthScope(data?.scope === 'ALL' ? 'ALL' : 'SCOPED');
        setAuthError(null);
        setSessionExpired(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setAuthError('unauthenticated');
        setRole('CLIENT');
        setEngagementIds([]);
        if (err instanceof ApiResponseError && [401, 411, 413].includes(err.status)) {
          navigate('/login', { replace: true, state: { from: location.pathname } });
        }
      })
      .finally(() => {
        if (!active) return;
        setAuthLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate, location.pathname]);

  useEffect(() => {
    if (authLoading) return;

    if (authScope === 'ALL' || engagementIds.length === 0) {
      let active = true;
      fetchEngagements()
        .then((data) => {
          if (!active) return;
          const items = Array.isArray(data?.items) ? data.items : [];
          setAvailableEngagements(
            items
              .filter((item): item is EngagementListItem => Boolean(item?.id))
              .map((item) => ({
                id: item.id,
                label: item.label ?? item.id,
                status: item.status ?? null,
                startDate: item.startDate ?? null,
              })),
          );
        })
        .catch(() => {
          if (!active) return;
          setAvailableEngagements([]);
          setAuthError((prev) => prev ?? 'engagements_unavailable');
        });

      return () => {
        active = false;
      };
    }

    setAvailableEngagements(
      engagementIds.map((id) => ({ id, label: id, status: null, startDate: null })),
    );
  }, [authLoading, authScope, engagementIds]);

  useEffect(() => {
    if (engagementIdFromPath) {
      setSelectedEngagementId(engagementIdFromPath);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('lucien_selected_engagement', engagementIdFromPath);
      }
    }
  }, [engagementIdFromPath]);

  useEffect(() => {
    if (engagementIdFromPath) return;
    if (!availableIds.length) return;
    if (resolvedSelectedId) return;
    const nextId = availableIds[0];
    setSelectedEngagementId(nextId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lucien_selected_engagement', nextId);
    }
  }, [availableIds, resolvedSelectedId, engagementIdFromPath]);

  useEffect(() => {
    if (!selectedEngagementId) return;
    if (!availableIds.includes(selectedEngagementId)) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lucien_selected_engagement', selectedEngagementId);
    }
  }, [selectedEngagementId, availableIds]);

  useEffect(() => {
    if (!engagementId) {
      setSummary(null);
      setSummaryLoading(false);
      setSummaryError(null);
      setSessionExpired(false);
      return;
    }

    let active = true;
    setSummaryLoading(true);
    setSummaryError(null);

    fetchEngagementSummary(engagementId)
      .then((data) => {
        if (!active) return;
        setSummary(data);
        setSessionExpired(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSummary(null);
        if (err instanceof ApiResponseError && [401, 411, 413].includes(err.status)) {
          setSummaryError('session_expired');
          setSessionExpired(true);
        } else {
          setSummaryError('summary_unavailable');
        }
      })
      .finally(() => {
        if (!active) return;
        setSummaryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [engagementId]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path.includes(':id')) return location.pathname.startsWith('/engagements/');
    return location.pathname.startsWith(path);
  };

  const fallbackStates: Record<ModuleKey, ModuleState> = {
    intel: 'active',
    protocol: 'not_wired',
    outputs: 'not_wired',
    secureChannel: 'not_wired',
    contracts: 'action',
    billing: 'action',
    settlement: 'not_wired',
    opsConsole: 'not_wired',
    requestBuilder: 'not_wired',
    deliveryPipeline: 'not_wired',
    accessRoles: 'not_wired',
  };

  const resolvePath = (path: string, id?: string | null) => {
    if (!path.includes(':id')) return path;
    if (!id) return null;
    return path.replace(':id', id);
  };

  const resolveModuleState = (item: NavItem) => {
    if (!item.moduleKey) return item.fallbackState ?? 'active';
    return (
      summary?.modules?.[item.moduleKey]?.state ??
      fallbackStates[item.moduleKey] ??
      item.fallbackState ??
      'locked'
    );
  };

  const shouldShowItem = (item: NavItem) => {
    if (role !== 'CLIENT') return true;
    if (!item.moduleKey) return true;
    const state = resolveModuleState(item);
    return state !== 'locked' && state !== 'not_wired';
  };

  const resolveStateLabel = (state?: ModuleState | null) => {
    if (!state) return '—';
    return state.replace(/_/g, ' ').toUpperCase();
  };

  const resolveBadgeClasses = (state?: ModuleState | null) => {
    switch (state) {
      case 'active':
        return 'border-indigo-400/50 bg-indigo-500/10 text-indigo-200';
      case 'action':
        return 'border-amber-400/50 bg-amber-500/10 text-amber-200';
      case 'pending':
        return 'border-white/10 bg-white/5 text-gray-400';
      case 'not_wired':
        return 'border-white/10 bg-white/5 text-gray-500';
      case 'locked':
      default:
        return 'border-white/10 bg-white/5 text-gray-600';
    }
  };

  const baseNavGroups = role === 'OPERATOR' ? operatorGroups : clientGroups;
  const navGroups =
    role === 'CLIENT'
      ? baseNavGroups
          .map((group) => ({
            ...group,
            items: group.items.filter(shouldShowItem),
          }))
          .filter((group) => group.items.length > 0)
      : baseNavGroups;
  const hasMultipleEngagements = availableIds.length > 1;
  const showEngagementSelectPanel = !authLoading && !engagementId;

  const handleEngagementChange = (nextId: string) => {
    setSelectedEngagementId(nextId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lucien_selected_engagement', nextId);
    }
    if (location.pathname.includes('/engagements/')) {
      navigate(location.pathname.replace(/\/engagements\/[^/]+/, `/engagements/${nextId}`));
    }
  };

  const handleLogout = async () => {
    try {
      await postLogout();
    } finally {
      setRole('CLIENT');
      setEngagementIds([]);
      setAvailableEngagements([]);
      setSelectedEngagementId(null);
      setSummary(null);
      setSummaryError(null);
      navigate('/login', { replace: true });
    }
  };

  return (
    <PortalContext.Provider value={{ role, engagementId, summary, summaryLoading, summaryError }}>
      <div className="relative">
        <header className="fixed inset-x-0 top-0 z-20 h-16 border-b border-white/10 bg-[#030303]/80 backdrop-blur-md">
          <div className="mx-auto flex h-full w-full max-w-[1200px] items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-9 w-9 items-center justify-center border border-white/10 ${surface.deep}`}
              >
                <span className="text-xs font-mono uppercase tracking-[0.3em] text-gray-300">
                  L
                </span>
              </div>
              <div className="flex flex-col">
                <span className={label.micro}>SYSTEM ARCHITECT</span>
                <span className="text-sm font-semibold uppercase tracking-[0.35em]">LUCIEN</span>
              </div>
              <div className="hidden h-10 w-px bg-white/10 md:block" />
              <div className="hidden flex-col md:flex">
                <span className={label.micro}>ENGAGEMENT</span>
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-200">
                  {engagementId ?? '—'}
                </span>
              </div>
              {hasMultipleEngagements ? (
                <div className="hidden md:flex">
                  <select
                    value={engagementId ?? ''}
                    onChange={(event) => handleEngagementChange(event.target.value)}
                    className="border border-white/10 bg-[#080808] px-2 py-1 text-[10px] uppercase tracking-widest text-gray-300"
                  >
                    <option value="" disabled>
                      SELECT
                    </option>
                    {availableEngagements.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2 sm:flex">
                <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.7)] animate-pulse" />
                <span className={`${label.micro} ${text.muted}`}>SYSTEM ONLINE</span>
              </div>
              <span className="border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-gray-200">
                {role}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                EN
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="border border-white/10 px-3 py-1 text-[10px] uppercase tracking-widest text-gray-400 transition hover:border-indigo-400/40 hover:text-indigo-200"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1200px] px-6 pb-16 pt-[88px]">
          {sessionExpired ? (
            <div className="mb-4 border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-widest text-amber-200">
              SESSION EXPIRED — <Link to="/login">LOGIN REQUIRED</Link>
            </div>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside className={`${surface.panel} p-4`}>
              <p className={label.micro}>COMMAND MENU</p>
              <nav className="mt-4 space-y-4">
                {navGroups.map((group) => (
                  <div key={group.title} className="space-y-2">
                    <p className={label.micro}>{group.title}</p>
                    <div className="space-y-2">
                      {group.items.map((item) => {
                        const path = resolvePath(item.path, engagementId);
                        const moduleState = item.moduleKey
                          ? (summary?.modules?.[item.moduleKey]?.state ??
                            fallbackStates[item.moduleKey] ??
                            item.fallbackState ??
                            'locked')
                          : (item.fallbackState ?? 'active');
                        const isUnavailable =
                          !path || moduleState === 'locked' || moduleState === 'not_wired';
                        const active = isActive(item.path);
                        const isMuted = isUnavailable && !active;
                        const badgeClasses = resolveBadgeClasses(moduleState);
                        const badgeLabel = resolveStateLabel(moduleState);
                        return (
                          <Link
                            key={item.label}
                            to={path ?? location.pathname}
                            aria-current={active ? 'page' : undefined}
                            aria-disabled={isUnavailable || undefined}
                            tabIndex={isUnavailable ? -1 : 0}
                            onClick={(event) => {
                              if (isUnavailable) event.preventDefault();
                            }}
                            className={`flex items-center justify-between border border-white/5 px-3 py-2 text-xs uppercase tracking-widest transition duration-300 ${
                              active
                                ? 'border-l-2 border-indigo-400/80 bg-indigo-500/10 text-indigo-100'
                                : `text-gray-400 hover:border-white/20 hover:text-gray-200 ${glow.indigoHover}`
                            } ${isMuted ? 'opacity-60' : ''}`}
                          >
                            <span className={`${active ? 'text-indigo-200' : 'text-gray-300'}`}>
                              {item.label}
                            </span>
                            <span
                              className={`border px-2 py-1 text-[9px] uppercase tracking-widest ${badgeClasses}`}
                            >
                              {badgeLabel}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>

            <section>
              {showEngagementSelectPanel ? (
                <div className={`${surface.panel} p-8`}>
                  <p className={label.micro}>ENGAGEMENT</p>
                  <h2 className="mt-3 text-2xl font-semibold uppercase tracking-[0.3em]">
                    Select Engagement
                  </h2>
                  <p className={`mt-3 text-sm ${text.muted}`}>Choose an engagement to continue.</p>
                  <div className="mt-6 grid gap-3">
                    {availableEngagements.length === 0 ? (
                      <div className="border border-white/5 px-4 py-6 text-center text-xs uppercase tracking-widest text-gray-500">
                        NO ENGAGEMENTS AVAILABLE
                      </div>
                    ) : (
                      availableEngagements.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleEngagementChange(item.id)}
                          className="flex items-center justify-between border border-white/5 px-4 py-3 text-xs uppercase tracking-widest text-gray-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/10"
                        >
                          <span>{item.id}</span>
                          <span className="text-[10px] text-gray-400">{item.status ?? '—'}</span>
                        </button>
                      ))
                    )}
                  </div>
                  {authError ? (
                    <p className="mt-4 text-xs text-rose-300">AUTH ERROR: {authError}</p>
                  ) : null}
                </div>
              ) : (
                children
              )}
            </section>
          </div>
        </div>
      </div>
    </PortalContext.Provider>
  );
}
