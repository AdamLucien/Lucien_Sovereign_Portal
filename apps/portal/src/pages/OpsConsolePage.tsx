import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchOpsConsole, type OpsConsoleResponse } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  if (status === 429) return 'Ops console rate limited.';
  return 'Ops telemetry unavailable.';
};

const trendLabel = (trend: NonNullable<OpsConsoleResponse['metrics'][number]>['trend']) => {
  switch (trend) {
    case 'minor_up':
      return '↑';
    case 'minor_down':
      return '↓';
    default:
      return '→';
  }
};

export default function OpsConsolePage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.opsConsole?.state ?? null;
  const [data, setData] = useState<OpsConsoleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagementId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchOpsConsole(engagementId)
      .then((response) => {
        if (!active) return;
        setData(response);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError('Ops telemetry unavailable.');
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [engagementId]);

  if (!engagementId || moduleState === 'locked' || moduleState === 'not_wired') {
    return <ModulePlaceholder title="OPS CONSOLE" moduleKey="opsConsole" />;
  }

  return (
    <div className="space-y-6">
      <div className={`${surface.panel} p-8`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={label.micro}>OPS</p>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">Ops Console</h1>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-400">
            {loading ? '…' : (data?.systemStatus?.toUpperCase() ?? '—')}
          </span>
        </div>
        <p className={`mt-3 text-xs uppercase tracking-widest ${text.muted}`}>
          {data ? `Last sync ${new Date(data.lastSyncAt).toLocaleTimeString()}` : 'Connecting…'}
        </p>
      </div>

      <div className={`${surface.panel} p-8 space-y-4`}>
        <p className={label.micro}>METRICS</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {data?.metrics.map((metric) => (
            <div key={metric.label} className="border border-white/5 p-4">
              <p className="text-xs uppercase tracking-widest text-gray-200">{metric.label}</p>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-semibold uppercase text-indigo-200">
                  {metric.value}
                </span>
                <span className="text-xs uppercase text-gray-400">{trendLabel(metric.trend)}</span>
              </div>
            </div>
          ))}
          {!data?.metrics.length && !loading ? (
            <p className={`text-xs uppercase tracking-widest ${text.muted}`}>
              Metrics unavailable.
            </p>
          ) : null}
        </div>
      </div>

      <div className={`${surface.panel} p-8 space-y-4`}>
        <div className="flex items-center justify-between">
          <p className={label.micro}>ALERTS</p>
          <span className="text-[10px] uppercase tracking-widest text-gray-400">
            {data?.alerts.length ?? 0} recent
          </span>
        </div>
        <div className="space-y-3">
          {data?.alerts.map((alert) => (
            <div
              key={alert.id}
              className="border border-white/5 px-4 py-3 text-[10px] uppercase tracking-widest text-gray-200"
            >
              <div className="flex items-center justify-between">
                <span>{alert.level.toUpperCase()}</span>
                <span className="text-gray-400">
                  {new Date(alert.raisedAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-300">{alert.message}</p>
            </div>
          ))}
          {!data?.alerts.length && !loading ? (
            <p className={`text-xs uppercase tracking-widest ${text.muted}`}>No alerts.</p>
          ) : null}
        </div>
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
