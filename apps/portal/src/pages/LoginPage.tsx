import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ApiResponseError } from '../lib/api';
import { postLogin } from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  if (status === 401) return 'Invalid credentials.';
  if (status === 400) return 'Email and password required.';
  return 'Authentication failed.';
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await postLogin({ email, password });
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiResponseError) {
        setError(formatError(err.status));
      } else {
        setError(formatError());
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[560px] px-6 pt-24">
      <div className={`${surface.panel} p-8`}>
        <p className={label.micro}>ACCESS</p>
        <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.3em]">System Login</h1>
        <p className={`mt-3 text-sm ${text.muted}`}>Authenticate to access the portal.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className={label.micro} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className={`${surface.input} mt-2 w-full px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label className={label.micro} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={`${surface.input} mt-2 w-full px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full border border-indigo-400/40 bg-indigo-500/10 px-4 py-2 text-xs uppercase tracking-widest text-indigo-200 transition hover:border-indigo-400/60 disabled:opacity-50"
          >
            {loading ? 'Authenticating…' : 'Enter'}
          </button>
        </form>

        {error ? <p className="mt-4 text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
