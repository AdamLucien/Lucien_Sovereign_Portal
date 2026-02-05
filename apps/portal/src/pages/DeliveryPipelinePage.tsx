import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchDeliveryPipeline, type DeliveryStage } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  if (status === 429) return 'Delivery pipeline rate limited.';
  return 'Delivery data unavailable.';
};

const statusClasses = (status: DeliveryStage['status']) => {
  switch (status) {
    case 'complete':
      return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200';
    case 'in_progress':
      return 'border-indigo-400/50 bg-indigo-500/10 text-indigo-200';
    case 'pending':
    default:
      return 'border-white/10 bg-white/5 text-gray-400';
  }
};

export default function DeliveryPipelinePage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.deliveryPipeline?.state ?? null;
  const [stages, setStages] = useState<DeliveryStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagementId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchDeliveryPipeline(engagementId)
      .then((response) => {
        if (!active) return;
        setStages(response.stages);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError('Delivery data unavailable.');
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
    return <ModulePlaceholder title="DELIVERY PIPELINE" moduleKey="deliveryPipeline" />;
  }

  return (
    <div className="space-y-6">
      <div className={`${surface.panel} p-8`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={label.micro}>OPS</p>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">
              Delivery Pipeline
            </h1>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-400">
            {loading ? '…' : `${stages.length} stages`}
          </span>
        </div>
      </div>

      <div className={`${surface.panel} p-8 space-y-3`}>
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="flex items-center justify-between border border-white/5 px-4 py-3"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-200">{stage.label}</p>
              <p className={`text-[10px] uppercase tracking-widest ${text.muted}`}>
                Updated {new Date(stage.updatedAt).toLocaleDateString()} ·{' '}
                {stage.owner.toUpperCase()}
              </p>
            </div>
            <span
              className={`border px-3 py-1 text-[9px] uppercase tracking-widest ${statusClasses(stage.status)}`}
            >
              {stage.status.toUpperCase()}
            </span>
          </div>
        ))}
        {!stages.length && !loading ? (
          <p className={`text-xs uppercase tracking-widest ${text.muted}`}>Pipeline unavailable.</p>
        ) : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
