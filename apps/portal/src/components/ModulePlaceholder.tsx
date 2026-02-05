import { usePortalContext } from '../layout/PortalShell';
import { label, surface, text } from '../styles/tokens';

import type { ModuleKey, ModuleState } from '../lib/portal';

type ModulePlaceholderProps = {
  title: string;
  moduleKey: ModuleKey;
};

const STATE_LABELS: Record<ModuleState, string> = {
  active: 'ACTIVE',
  pending: 'PENDING',
  locked: 'LOCKED',
  action: 'ACTION',
  not_wired: 'NOT WIRED',
};

const resolveMessage = (state: ModuleState) => {
  if (state === 'locked') return 'NOT PROVISIONED FOR CURRENT TIER';
  if (state === 'not_wired') return 'NOT WIRED — BACKEND PENDING';
  return 'MODULE WIRED — BACKEND PENDING';
};

export default function ModulePlaceholder({ title, moduleKey }: ModulePlaceholderProps) {
  const { summary, summaryLoading } = usePortalContext();
  const moduleState = summary?.modules?.[moduleKey]?.state;

  if (!summary && summaryLoading) {
    return (
      <div className={`${surface.panel} p-8`}>
        <p className={label.micro}>{title}</p>
        <div className="mt-4">
          <p className={label.micro}>STATUS</p>
          <p className="text-2xl font-semibold uppercase tracking-[0.35em] text-gray-200">…</p>
          <p className={`mt-3 text-xs uppercase tracking-widest ${text.muted}`}>FETCHING SUMMARY</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={`${surface.panel} p-8`}>
        <p className={label.micro}>{title}</p>
        <div className="mt-4">
          <p className={label.micro}>STATUS</p>
          <p className="text-2xl font-semibold uppercase tracking-[0.35em] text-gray-200">—</p>
          <p className={`mt-3 text-xs uppercase tracking-widest ${text.muted}`}>
            SUMMARY UNAVAILABLE
          </p>
        </div>
      </div>
    );
  }

  const resolvedState = moduleState ?? 'not_wired';

  return (
    <div className={`${surface.panel} p-8`}>
      <p className={label.micro}>{title}</p>
      <div className="mt-4">
        <p className={label.micro}>STATUS</p>
        <p className="text-2xl font-semibold uppercase tracking-[0.35em] text-gray-200">
          {STATE_LABELS[resolvedState]}
        </p>
        <p className={`mt-3 text-xs uppercase tracking-widest ${text.muted}`}>
          {resolveMessage(resolvedState)}
        </p>
      </div>
    </div>
  );
}
