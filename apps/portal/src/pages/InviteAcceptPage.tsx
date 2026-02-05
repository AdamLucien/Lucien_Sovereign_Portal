import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ApiResponseError } from '../lib/api';
import { postInviteAccept } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  switch (status) {
    case 400:
      return 'Invite token missing.';
    case 401:
      return 'Invite token invalid or expired.';
    default:
      return 'Invite acceptance failed.';
  }
};

export default function InviteAcceptPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (!token) {
      setError(formatError(400));
      setLoading(false);
      return;
    }

    setLoading(true);
    postInviteAccept(token)
      .then(() => {
        navigate('/', { replace: true });
      })
      .catch((err: unknown) => {
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError(formatError());
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [location.search, navigate]);

  return (
    <div className="mx-auto w-full max-w-[560px] px-6 pt-24">
      <div className={`${surface.panel} p-8`}>
        <p className={label.micro}>INVITE</p>
        <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.3em]">Accepting Invite</h1>
        <p className={`mt-3 text-sm ${text.muted}`}>
          {loading ? 'Processing your invite…' : 'Invite processing completed.'}
        </p>
        {error ? <p className="mt-4 text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
