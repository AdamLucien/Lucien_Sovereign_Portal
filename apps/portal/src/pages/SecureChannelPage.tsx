import { useCallback, useEffect, useState } from 'react';

import ModulePlaceholder from '../components/ModulePlaceholder';
import { usePortalContext } from '../layout/PortalShell';
import { ApiResponseError } from '../lib/api';
import {
  fetchSecureMessages,
  fetchSecureStatus,
  postSecureHandshake,
  postSecureMessage,
  type SecureMessagesResponse,
} from '../lib/portal';
import { label, surface, text } from '../styles/tokens';

const formatError = (status?: number) => {
  switch (status) {
    case 411:
      return 'Proxy missing Content-Length';
    case 413:
      return 'Payload too large (max 50KB)';
    case 429:
      return 'Rate limited, try later';
    case 501:
      return 'Secure channel disabled in production';
    default:
      return 'Transmission error';
  }
};

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const randomBase64 = (length = 24) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export default function SecureChannelPage() {
  const { engagementId, summary, role } = usePortalContext();
  const moduleState = summary?.modules?.secureChannel?.state ?? null;
  const isProd = import.meta.env.MODE === 'production';
  const [status, setStatus] = useState<'pending' | 'ready' | null>(null);
  const [serverKey, setServerKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<SecureMessagesResponse['items']>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldFetch =
    Boolean(engagementId) && moduleState !== 'locked' && moduleState !== 'not_wired';

  const loadStatus = useCallback(() => {
    if (!engagementId) return;
    setLoading(true);
    setError(null);
    fetchSecureStatus(engagementId)
      .then((data) => {
        setStatus(data.status);
        setServerKey(data.serverPublicKey);
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
  }, [engagementId]);

  const loadMessages = useCallback(() => {
    if (!engagementId) return;
    fetchSecureMessages(engagementId)
      .then((data) => {
        setMessages(data.items ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiResponseError) {
          setError(formatError(err.status));
        } else {
          setError(formatError());
        }
      });
  }, [engagementId]);

  useEffect(() => {
    if (!shouldFetch || !engagementId) {
      setStatus(null);
      setServerKey(null);
      setMessages([]);
      return;
    }
    loadStatus();
    loadMessages();
  }, [shouldFetch, engagementId, loadStatus, loadMessages]);

  const handleHandshake = async () => {
    if (!engagementId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await postSecureHandshake(engagementId, {
        clientPublicKey: randomBase64(32),
      });
      setStatus(response.status);
      setServerKey(response.serverPublicKey);
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

  const handleSend = async () => {
    if (!engagementId || !messageInput.trim()) return;
    setSending(true);
    setError(null);
    try {
      await postSecureMessage(engagementId, {
        ciphertext: toBase64(messageInput.trim()),
        nonce: randomBase64(16),
        sender: role === 'OPERATOR' ? 'operator' : 'client',
        sentAt: new Date().toISOString(),
      });
      setMessageInput('');
      loadMessages();
    } catch (err: unknown) {
      if (err instanceof ApiResponseError) {
        setError(formatError(err.status));
      } else {
        setError(formatError());
      }
    } finally {
      setSending(false);
    }
  };

  if (!engagementId) {
    return <ModulePlaceholder title="SECURE CHANNEL" moduleKey="secureChannel" />;
  }

  if (moduleState === 'locked' || moduleState === 'not_wired') {
    return <ModulePlaceholder title="SECURE CHANNEL" moduleKey="secureChannel" />;
  }

  const statusLabel = loading ? '…' : (status ?? 'PENDING');
  const serverLabel = serverKey ? `${serverKey.slice(0, 16)}…` : '—';
  const statusTone = status === 'ready' ? 'text-indigo-200' : 'text-gray-400';
  const messageStatus = sending ? 'UPLOADING…' : 'READY';

  return (
    <div className="space-y-6">
      <div className={`${surface.panel} p-8`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={label.micro}>COMMS</p>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em]">
              Secure Channel
            </h1>
          </div>
          <span className={`text-xs uppercase tracking-widest ${statusTone}`}>{statusLabel}</span>
        </div>
        <p className={`mt-3 text-xs uppercase tracking-widest ${text.muted}`}>
          E2EE STUB — NOT SECURE FOR PRODUCTION
        </p>
        <div className="mt-3 border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[10px] uppercase tracking-widest text-amber-200">
          {isProd
            ? 'SECURE CHANNEL DISABLED IN PRODUCTION'
            : 'FOR DEVELOPMENT ONLY — DO NOT USE FOR SENSITIVE DATA'}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className={label.micro}>SERVER KEY</p>
            <p className="mt-1 text-xs font-mono text-gray-400">{serverLabel}</p>
          </div>
          <div>
            <p className={label.micro}>STATUS</p>
            <p className="mt-1 text-xs font-mono text-gray-400">{statusLabel}</p>
          </div>
        </div>
        {status !== 'ready' ? (
          <button
            type="button"
            onClick={handleHandshake}
            className="mt-6 border border-indigo-400/40 bg-indigo-500/10 px-4 py-2 text-xs uppercase tracking-widest text-indigo-200 transition hover:border-indigo-400/60"
          >
            Initiate Handshake
          </button>
        ) : null}
      </div>

      <div className={`${surface.panel} p-8`}>
        <div className="flex items-center justify-between">
          <p className={label.micro}>MESSAGE LOG</p>
          <span
            className={`text-[10px] font-mono uppercase tracking-widest ${text.muted} ${sending ? 'animate-pulse' : ''}`}
          >
            {messageStatus}
          </span>
        </div>
        <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto border border-white/5 p-4 custom-scrollbar">
          {messages.length === 0 ? (
            <p className="text-xs uppercase tracking-widest text-gray-500">
              AWAITING INITIALIZATION
            </p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="border border-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">
                  {msg.sender.toUpperCase()} · {msg.sentAt}
                </p>
                <p className="mt-2 text-xs font-mono text-gray-300">{msg.ciphertext}</p>
              </div>
            ))
          )}
        </div>
        <div className="mt-4">
          <p className={label.micro}>PLAINTEXT (DEV)</p>
          <textarea
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] p-3 text-sm text-gray-200"
            placeholder="Enter message payload"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!messageInput.trim() || sending}
            className="mt-3 border border-white/10 px-4 py-2 text-xs uppercase tracking-widest text-gray-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 disabled:opacity-50"
          >
            Send Ciphertext
          </button>
        </div>
        {error ? <p className="mt-4 text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
