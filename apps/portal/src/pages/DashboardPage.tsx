import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchIntelRequests } from '../lib/intel';
import { fetchSettlement, type ModuleKey, type ModuleState } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  switch (status) {
    case 411:
      return 'Proxy missing Content-Length';
    case 413:
      return 'File too large (max 50MB)';
    case 429:
      return 'Rate limited, try later';
    default:
      return 'Transmission error';
  }
};

const stateLabel = (state?: ModuleState | null) => {
  if (!state) return '—';
  return state.replace(/_/g, ' ').toUpperCase();
};

const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: 'intel', label: 'INTEL INTAKE' },
  { key: 'protocol', label: 'PROTOCOL' },
  { key: 'outputs', label: 'OUTPUTS' },
  { key: 'secureChannel', label: 'SECURE CHANNEL' },
  { key: 'contracts', label: 'CONTRACTS' },
  { key: 'billing', label: 'BILLING' },
  { key: 'settlement', label: 'SETTLEMENT' },
];

export default function DashboardPage() {
  const { engagementId, summary, summaryLoading } = usePortalContext();
  const intelModuleState = summary?.modules?.intel?.state ?? null;
  const settlementModuleState = summary?.modules?.settlement?.state ?? null;
  const [intelCount, setIntelCount] = useState<number | null>(null);
  const [openActions, setOpenActions] = useState<number | null>(null);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [settlementStatus, setSettlementStatus] = useState<string | null>(null);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);

  useEffect(() => {
    if (!engagementId || intelModuleState === 'locked' || intelModuleState === 'not_wired') {
      setIntelCount(null);
      setOpenActions(null);
      setIntelError(null);
      setIntelLoading(false);
      return;
    }

    let active = true;
    setIntelLoading(true);
    setIntelError(null);

    fetchIntelRequests(engagementId)
      .then((data) => {
        if (!active) return;
        const open = data.filter(
          (item) => item.status === 'pending' || item.status === 'needs_revision',
        ).length;
        setIntelCount(data.length);
        setOpenActions(open);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          setIntelError(formatError(err.status));
        } else {
          setIntelError(formatError());
        }
      })
      .finally(() => {
        if (!active) return;
        setIntelLoading(false);
      });

    return () => {
      active = false;
    };
  }, [engagementId, intelModuleState]);

  useEffect(() => {
    if (!engagementId || settlementModuleState === 'locked') {
      setSettlementStatus(settlementModuleState === 'locked' ? 'LOCKED' : null);
      setSettlementError(null);
      setSettlementLoading(false);
      return;
    }

    let active = true;
    setSettlementLoading(true);
    setSettlementError(null);

    fetchSettlement(engagementId)
      .then((data) => {
        if (!active) return;
        setSettlementStatus(data.status.toUpperCase());
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          const code = (err.payload as { code?: string } | undefined)?.code;
          if (err.status === 403 && code === 'invoice_not_found') {
            setSettlementStatus('LOCKED');
            return;
          }
          setSettlementError(formatError(err.status));
        } else {
          setSettlementError(formatError());
        }
      })
      .finally(() => {
        if (!active) return;
        setSettlementLoading(false);
      });

    return () => {
      active = false;
    };
  }, [engagementId, settlementModuleState]);

  const intelCountLabel = intelLoading ? '…' : (intelCount ?? '—');
  const openActionsLabel = intelLoading ? '…' : (openActions ?? '—');
  const settlementLabel = settlementLoading ? '…' : (settlementStatus ?? '—');
  const summaryStatus = summaryLoading ? '…' : (summary?.status ?? '—');
  const summaryTier = summaryLoading ? '…' : (summary?.tier ?? '—');
  const summaryStartDate = summaryLoading ? '…' : (summary?.startDate ?? '—');
  const summaryEngagement = summaryLoading ? '…' : (summary?.id ?? engagementId ?? '—');

  const intelIntakePath = useMemo(() => {
    if (!engagementId) return null;
    if (intelModuleState === 'locked' || intelModuleState === 'not_wired') return null;
    return `/engagements/${engagementId}/intel`;
  }, [engagementId, intelModuleState]);

  return (
    <div className="space-y-6">
      <div className={`${surface.panel} p-8`}>
        <p className={label.micro}>OVERVIEW</p>
        <h1 className="mt-3 text-3xl font-semibold uppercase tracking-[0.3em]">
          Operational Overview
        </h1>
        <p className={`mt-4 text-sm ${text.muted}`}>
          Secure operational posture confirmed. Select a module to proceed.
        </p>
        <div className="mt-6">
          {intelIntakePath ? (
            <Link
              className="text-xs font-semibold uppercase tracking-widest text-indigo-200 hover:text-indigo-100"
              to={intelIntakePath}
            >
              Jump to Intel Intake
            </Link>
          ) : (
            <span className="text-xs uppercase tracking-widest text-gray-500">
              Intel Intake unavailable
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`${surface.panel} p-6`}>
          <p className={label.micro}>Engagement Overview</p>
          <div className="mt-4 space-y-3">
            <div>
              <p className={label.micro}>Engagement ID</p>
              <p className="text-sm font-semibold uppercase tracking-widest text-gray-200">
                {summaryEngagement}
              </p>
            </div>
            <div>
              <p className={label.micro}>Status</p>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
                {summaryStatus}
              </p>
            </div>
            <div>
              <p className={label.micro}>Package</p>
              <p className={`text-sm ${text.muted}`}>{summaryTier}</p>
            </div>
            <div>
              <p className={label.micro}>Start Date</p>
              <p className={`text-sm ${text.muted}`}>{summaryStartDate}</p>
            </div>
          </div>
        </div>

        <div className={`${surface.panel} p-6`}>
          <p className={label.micro}>System State</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className={text.muted}>Intel Requests</span>
              <span className="font-semibold text-gray-200">{intelCountLabel}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className={text.muted}>Open Actions</span>
              <span className="font-semibold text-gray-200">{openActionsLabel}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className={text.muted}>Last Activity</span>
              <span className="font-semibold text-gray-200">—</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className={text.muted}>Settlement</span>
              <span className="font-semibold text-gray-200">{settlementLabel}</span>
            </div>
          </div>
          {intelError || settlementError ? (
            <p className="mt-3 text-xs text-rose-300">{intelError ?? settlementError}</p>
          ) : null}
        </div>

        <div className={`${surface.panel} p-6`}>
          <p className={label.micro}>Provisioned Modules</p>
          <div className="mt-4 grid gap-3">
            {MODULES.map((module) => {
              const state = summary?.modules?.[module.key]?.state ?? null;
              const labelText = summaryLoading ? '…' : stateLabel(state);
              return (
                <div
                  key={module.label}
                  className="flex items-center justify-between border border-white/5 px-3 py-2"
                >
                  <span className="text-xs uppercase tracking-widest text-gray-200">
                    {module.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">
                    {labelText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
