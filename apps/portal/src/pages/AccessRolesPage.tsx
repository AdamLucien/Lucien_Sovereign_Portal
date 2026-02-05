import { useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import { fetchAccessRoles, type AccessRole } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  switch (status) {
    case 429:
      return 'Access query rate limited.';
    default:
      return 'Access data unavailable.';
  }
};

export default function AccessRolesPage() {
  const { engagementId, summary } = usePortalContext();
  const moduleState = summary?.modules?.accessRoles?.state ?? null;
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagementId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchAccessRoles(engagementId)
      .then((response) => {
        if (!active) return;
        setRoles(response.roles);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError('Access data unavailable.');
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
    return <ModulePlaceholder title="ACCESS & ROLES" moduleKey="accessRoles" />;
  }

  return (
    <div className="space-y-6">
      <div className={`${surface.panel} p-8`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={label.micro}>OPS</p>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">
              Access & Roles
            </h1>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-400">
            {loading ? '…' : `${roles.length} roles`}
          </span>
        </div>
      </div>

      <div className={`${surface.panel} p-8 space-y-3`}>
        {roles.map((role) => (
          <div
            key={role.role}
            className="flex items-center justify-between border border-white/5 px-4 py-3"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-200">{role.role}</p>
              <p className={`text-[10px] uppercase tracking-widest ${text.muted}`}>
                Scope {role.scope} · Last reviewed{' '}
                {role.lastReviewedAt ? new Date(role.lastReviewedAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <span
              className={`border px-3 py-1 text-[9px] uppercase tracking-widest ${role.assigned ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-white/5 text-gray-400'}`}
            >
              {role.assigned ? 'ASSIGNED' : 'UNASSIGNED'}
            </span>
          </div>
        ))}
        {!roles.length && !loading ? (
          <p className={`text-xs uppercase tracking-widest ${text.muted}`}>No roles available.</p>
        ) : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
