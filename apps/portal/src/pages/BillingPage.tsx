import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchBilling, type BillingInvoice, type BillingResponse } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  switch (status) {
    case 429:
      return 'Rate limited.';
    default:
      return 'Billing data unavailable.';
  }
};

const statusClasses = (status: BillingInvoice['status']) => {
  switch (status) {
    case 'paid':
      return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200';
    case 'overdue':
      return 'border-rose-400/50 bg-rose-500/10 text-rose-200';
    case 'unpaid':
    default:
      return 'border-white/10 bg-white/5 text-gray-400';
  }
};

export default function BillingPage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.billing?.state ?? null;
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagementId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchBilling(engagementId)
      .then((response) => {
        if (!active) return;
        setData(response);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError('Billing data unavailable.');
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
    return <ModulePlaceholder title="BILLING" moduleKey="billing" />;
  }

  return (
    <div className="space-y-6">
      <div className={`${surface.panel} p-8`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={label.micro}>BILLING</p>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">Ledger</h1>
          </div>
          <span className="text-[12px] font-mono uppercase tracking-widest text-gray-400">
            {loading
              ? '…'
              : data
                ? `${data.outstandingTotal.toFixed(2)} ${data.invoices[0]?.currency ?? 'USD'}`
                : '—'}
          </span>
        </div>
        <p className={`mt-3 text-xs uppercase tracking-widest ${text.muted}`}>
          {data?.note ?? 'Invoices reflect ERP Sales Invoice entries.'}
        </p>
      </div>

      <div className={`${surface.panel} p-8 space-y-4`}>
        {data?.invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="flex items-center justify-between border border-white/5 px-4 py-3"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-200">{invoice.id}</p>
              <p className={`text-[10px] uppercase tracking-widest ${text.muted}`}>
                Due {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'TBD'} ·{' '}
                {invoice.outstanding > 0 ? 'Outstanding' : 'Settled'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold uppercase tracking-widest text-gray-200">
                {invoice.amount.toFixed(2)} {invoice.currency}
              </span>
              <span
                className={`border px-3 py-1 text-[9px] uppercase tracking-widest ${statusClasses(
                  invoice.status,
                )}`}
              >
                {invoice.status.toUpperCase()}
              </span>
            </div>
          </div>
        ))}
        {!data?.invoices.length && !loading ? (
          <p className={`text-xs uppercase tracking-widest ${text.muted}`}>No invoices found.</p>
        ) : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
