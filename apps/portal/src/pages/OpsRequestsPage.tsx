import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchOpsRequests, type OpsRequestItem } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  switch (status) {
    case 429:
      return 'Too many requests.';
    default:
      return 'Ops requests unavailable.';
  }
};

export default function OpsRequestsPage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.requestBuilder?.state ?? null;
  const [items, setItems] = useState<OpsRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagementId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchOpsRequests(engagementId)
      .then((response) => {
        if (!active) return;
        setItems(response.items);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError('Ops requests unavailable.');
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
    return <ModulePlaceholder title="REQUEST BUILDER" moduleKey="requestBuilder" />;
  }

  return (
    <div className="space-y-6">
      <div className={`${surface.panel} p-8`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={label.micro}>OPS</p>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">
              Request Builder
            </h1>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-400">
            {loading ? '…' : items.length ? `${items.length} active` : '—'}
          </span>
        </div>
      </div>

      <div className={`${surface.panel} p-8 space-y-3`}>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between border border-white/5 px-4 py-3"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-200">
                {item.title ?? item.id}
              </p>
              <p className={`text-[10px] uppercase tracking-widest ${text.muted}`}>
                {item.visibility.toUpperCase()} · {item.assignedTo}
              </p>
            </div>
            <span className="border px-3 py-1 text-[9px] uppercase tracking-widest text-indigo-200">
              {item.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        ))}
        {!items.length && !loading ? (
          <p className={`text-xs uppercase tracking-widest ${text.muted}`}>No requests found.</p>
        ) : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
