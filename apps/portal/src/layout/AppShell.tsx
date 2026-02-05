import { useEffect, useRef, useState, type ReactNode } from 'react';

type AppShellProps = {
  children: ReactNode;
};

const NOISE_DATA_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='0.6'/></svg>";

export default function AppShell({ children }: AppShellProps) {
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.4 });

  useEffect(() => {
    const update = () => {
      rafRef.current = null;
      if (!pendingRef.current) return;
      setMouse(pendingRef.current);
      pendingRef.current = null;
    };

    const handleMove = (event: MouseEvent) => {
      const x = Math.min(Math.max(event.clientX / window.innerWidth, 0), 1);
      const y = Math.min(Math.max(event.clientY / window.innerHeight, 0), 1);
      pendingRef.current = { x, y };
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(update);
      }
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const glowX = `${Math.round(mouse.x * 100)}%`;
  const glowY = `${Math.round(mouse.y * 100)}%`;

  return (
    <div className="relative min-h-screen bg-[#030303] text-[#e5e5e5]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04] mix-blend-overlay"
        style={{ backgroundImage: `url("${NOISE_DATA_URL}")` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.10]"
        style={{
          backgroundImage: [
            `radial-gradient(600px 600px at ${glowX} ${glowY}, rgba(99,102,241,0.25), transparent 60%)`,
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: 'auto, 48px 48px, 48px 48px',
          backgroundPosition: 'center, center, center',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
