import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { glow, label, surface, text } from '../styles/tokens';

export default function PortalHeader() {
  const location = useLocation();
  const engagementId = useMemo(() => {
    const match = location.pathname.match(/\/engagements\/([^/]+)/i);
    return match?.[1] ?? null;
  }, [location.pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-20 h-16 border-b border-white/10 bg-[#030303]/80 backdrop-blur-md">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 ${surface.deep}`}
          >
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-gray-300">L</span>
          </div>
          <div className="flex flex-col">
            <span className={label.micro}>SYSTEM ARCHITECT</span>
            <span className="text-sm font-semibold uppercase tracking-[0.35em]">LUCIEN</span>
          </div>
        </div>

        {engagementId ? (
          <div className="hidden items-center gap-2 md:flex">
            <span className={label.micro}>ENGAGEMENT</span>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-200">
              {engagementId}
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.7)]" />
            <span className={`${label.micro} ${text.muted}`}>SYSTEM ONLINE</span>
          </div>
          <span
            className={`rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-gray-200 ${glow.indigoHover}`}
          >
            OPERATOR
          </span>
        </div>
      </div>
    </header>
  );
}
