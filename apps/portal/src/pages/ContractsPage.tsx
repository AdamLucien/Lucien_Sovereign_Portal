import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchContracts, type ContractItem } from '../lib/portal';
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

const statusClasses = (status: ContractItem['status']) => {
  switch (status) {
    case 'signed':
      return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200';
    case 'action':
      return 'border-amber-400/50 bg-amber-500/10 text-amber-200';
    case 'not_wired':
      return 'border-white/10 bg-white/5 text-gray-500';
    case 'pending':
    default:
      return 'border-white/10 bg-white/5 text-gray-400';
  }
};

export default function ContractsPage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.contracts?.state ?? null;
  const [items, setItems] = useState<ContractItem[]>([]);
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

    fetchContracts(engagementId)
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
    return <ModulePlaceholder title="CONTRACTS" moduleKey="contracts" />;
  }

  if (moduleState === 'locked') {
    return <ModulePlaceholder title="CONTRACTS" moduleKey="contracts" />;
  }

  const statusLabel = loading ? '…' : wired === false ? 'NOT WIRED' : 'ACTIVE';

  return (
    <div className={`${surface.panel} p-8`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={label.micro}>LEGAL</p>
          <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">Contracts</h1>
        </div>
        <span className="border border-white/10 px-3 py-1 text-[10px] uppercase tracking-widest text-gray-400">
          {statusLabel}
        </span>
      </div>

      {wired === false ? (
        <p className="mt-3 text-xs uppercase tracking-widest text-rose-300">CONTRACTS: NOT WIRED</p>
      ) : null}

      <div className="mt-6 space-y-3">
        {items.length === 0 && !loading ? (
          <div className="border border-white/5 px-4 py-6 text-center text-xs uppercase tracking-widest text-gray-500">
            {wired === false ? 'NOT WIRED' : 'NO CONTRACTS AVAILABLE'}
          </div>
        ) : null}
        {items.map((item) => (
          <div
            key={item.type}
            className="flex items-center justify-between border border-white/5 px-4 py-3"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-200">{item.label}</p>
              <p className={`mt-1 text-[10px] ${text.muted}`}>
                {item.updatedAt ? `UPDATED ${item.updatedAt}` : 'NO TIMESTAMP'}
              </p>
            </div>
            <span
              className={`border px-3 py-1 text-[9px] uppercase tracking-widest ${statusClasses(item.status)}`}
            >
              {item.status.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {error ? <p className="mt-4 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
