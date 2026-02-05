import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchOutputs, type OutputItem } from '../lib/portal';
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

const statusClasses = (status: OutputItem['status']) => {
  switch (status) {
    case 'accepted':
      return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200';
    case 'delivered':
      return 'border-indigo-400/50 bg-indigo-500/10 text-indigo-200';
    case 'in_progress':
      return 'border-white/10 bg-white/5 text-gray-400';
    case 'pending':
    default:
      return 'border-white/10 bg-white/5 text-gray-500';
  }
};

export default function OutputsPage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.outputs?.state ?? null;
  const [items, setItems] = useState<OutputItem[]>([]);
  const [wired, setWired] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const shouldFetch = Boolean(engagementId) && moduleState !== 'locked';

  useEffect(() => {
    if (!shouldFetch || !engagementId) {
      setItems([]);
      setWired(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchOutputs(engagementId)
      .then((data) => {
        if (!active) return;
        setItems(data.items ?? []);
        setWired(Boolean(data.wired));
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError(formatError());
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shouldFetch, engagementId]);

  if (!engagementId) {
    return <ModulePlaceholder title="OUTPUTS" moduleKey="outputs" />;
  }

  if (moduleState === 'locked') {
    return <ModulePlaceholder title="OUTPUTS" moduleKey="outputs" />;
  }

  return (
    <div className={`${surface.panel} p-8`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={label.micro}>DELIVERY</p>
          <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">Outputs</h1>
        </div>
        <span className="border border-white/10 px-3 py-1 text-[10px] uppercase tracking-widest text-gray-400">
          {loading ? '…' : wired === false ? 'NOT WIRED' : 'ACTIVE'}
        </span>
      </div>

      {wired === false ? (
        <p className="mt-3 text-xs uppercase tracking-widest text-rose-300">OUTPUTS: NOT WIRED</p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {items.length === 0 && !loading ? (
          <div className="border border-white/5 px-4 py-6 text-center text-xs uppercase tracking-widest text-gray-500 md:col-span-2">
            {wired === false ? 'NOT WIRED' : 'NO OUTPUTS AVAILABLE'}
          </div>
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="border border-white/10 px-5 py-4">
            <p className="text-xs uppercase tracking-widest text-gray-200">{item.title}</p>
            <p className={`mt-1 text-[10px] ${text.muted}`}>{item.category}</p>
            <div className="mt-4 flex items-center justify-between">
              <span
                className={`border px-3 py-1 text-[9px] uppercase tracking-widest ${statusClasses(item.status)}`}
              >
                {item.status.replace(/_/g, ' ').toUpperCase()}
              </span>
              <span className={`text-[10px] ${text.muted}`}>
                {item.updatedAt ? `UPDATED ${item.updatedAt}` : 'NO TIMESTAMP'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="mt-4 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
