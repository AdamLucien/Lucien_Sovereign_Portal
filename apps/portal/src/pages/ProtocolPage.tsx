import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchProtocolStatus, type ProtocolResponse } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  switch (status) {
    case 413:
      return 'Unexpected payload.';
    case 429:
      return 'Too many requests.';
    default:
      return 'Protocol telemetry unavailable.';
  }
};

const statusLabel = (status?: ProtocolResponse['status']) => {
  if (!status) return '—';
  return status.replace('_', ' ').toUpperCase();
};

export default function ProtocolPage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.protocol?.state ?? null;
  const [data, setData] = useState<ProtocolResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagementId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchProtocolStatus(engagementId)
      .then((response) => {
        if (!active) return;
        setData(response);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError('Protocol telemetry unavailable.');
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
    return <ModulePlaceholder title="PROTOCOL" moduleKey="protocol" />;
  }

  return (
    <div className="space-y-6">
      <div className={`${surface.panel} p-8`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={label.micro}>DELIVERY</p>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">Protocol</h1>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-400">
            {loading ? '…' : statusLabel(data?.status)}
          </span>
        </div>
        <p className={`mt-3 text-xs uppercase tracking-widest ${text.muted}`}>
          {data?.note ?? 'Live protocol telemetry coming soon.'}
        </p>
      </div>

      <div className={`${surface.panel} p-8`}>
        <p className={label.micro}>TIMELINE</p>
        <div className="mt-4 space-y-3">
          {data?.timeline.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between border border-white/5 px-4 py-3"
            >
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-200">{entry.label}</p>
                <p className={`text-[10px] uppercase tracking-widest ${text.muted}`}>
                  Due {new Date(entry.dueDate).toLocaleDateString()} · {entry.owner.toUpperCase()}
                </p>
              </div>
              <span className="border px-3 py-1 text-[9px] uppercase tracking-widest text-indigo-200">
                {entry.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          ))}
          {!data?.timeline.length && !loading ? (
            <p className={`text-xs uppercase tracking-widest ${text.muted}`}>
              Timeline unavailable.
            </p>
          ) : null}
        </div>
        {error ? <p className="mt-4 text-xs text-rose-300">{error}</p> : null}
      </div>

      <div className={`${surface.panel} p-8`}>
        <p className={label.micro}>TASKS</p>
        <div className="mt-4 space-y-3">
          {data?.tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between border border-white/5 px-4 py-3"
            >
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-200">{task.label}</p>
                <p className={`text-[10px] uppercase tracking-widest ${text.muted}`}>
                  ETA {new Date(task.eta).toLocaleDateString()} · {task.owner.toUpperCase()}
                </p>
              </div>
              <span className="border px-3 py-1 text-[9px] uppercase tracking-widest text-amber-200">
                {task.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          ))}
          {!data?.tasks.length && !loading ? (
            <p className={`text-xs uppercase tracking-widest ${text.muted}`}>Tasks unavailable.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
