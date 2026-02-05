import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchSettlement } from '../lib/portal';
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

export default function SettlementPage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.settlement?.state ?? null;
  const [status, setStatus] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!engagementId || moduleState === 'locked' || moduleState === 'not_wired') {
      setStatus(moduleState === 'locked' ? 'LOCKED' : null);
      setAmount(null);
      setCurrency(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchSettlement(engagementId)
      .then((data) => {
        if (!active) return;
        setStatus(data.status.toUpperCase());
        setAmount(data.amount);
        setCurrency(data.currency);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          const code = (err.payload as { code?: string } | undefined)?.code;
          if (err.status === 403 && code === 'invoice_not_found') {
            setStatus('LOCKED');
            return;
          }
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
  }, [engagementId, moduleState]);

  if (!engagementId) {
    return <ModulePlaceholder title="SETTLEMENT" moduleKey="settlement" />;
  }

  if (moduleState === 'locked' || moduleState === 'not_wired') {
    return <ModulePlaceholder title="SETTLEMENT" moduleKey="settlement" />;
  }

  const statusLabel = loading ? '…' : (status ?? '—');

  return (
    <div className={`${surface.panel} p-8`}>
      <p className={label.micro}>SETTLEMENT</p>
      <div className="mt-4 space-y-3">
        <div>
          <p className={label.micro}>STATUS</p>
          <p className="text-2xl font-semibold uppercase tracking-[0.35em] text-gray-200">
            {statusLabel}
          </p>
        </div>
        <div>
          <p className={label.micro}>AMOUNT</p>
          <p className={`text-sm ${text.muted}`}>
            {amount != null && currency ? `${amount} ${currency}` : '—'}
          </p>
        </div>
      </div>
      {error ? <p className="mt-4 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
