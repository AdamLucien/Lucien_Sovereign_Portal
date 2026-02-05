import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { ApiResponseError } from '../lib/api';
import { fetchIntelRequests, uploadIntelFile } from '../lib/intel';
import { glow, label, surface, text } from '../styles/tokens';

import type { IntelField, IntelRequestDTO } from '@lucien/contracts';

const statusStyles: Record<string, string> = {
  pending: 'bg-zinc-500/20 text-zinc-200 border-zinc-500/40',
  submitted: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40',
  needs_revision: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  accepted: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
};

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

type UploadState = {
  status: 'idle' | 'uploading' | 'success' | 'error';
  message?: string;
};

export default function IntelNodePage() {
  const { id } = useParams();
  const engagementId = id ?? '';
  const [requests, setRequests] = useState<IntelRequestDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({});
  const [touched, setTouched] = useState<Record<string, Record<string, boolean>>>({});
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});

  useEffect(() => {
    if (!engagementId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setSelectedId(null);

    fetchIntelRequests(engagementId)
      .then((data) => {
        if (!active) return;
        setRequests(data);
        if (data.length) {
          setSelectedId(data[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiResponseError) {
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
  }, [engagementId]);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? null,
    [requests, selectedId],
  );

  const updateValue = (requestId: string, fieldKey: string, value: unknown) => {
    setValues((prev) => ({
      ...prev,
      [requestId]: {
        ...prev[requestId],
        [fieldKey]: value,
      },
    }));
  };

  const markTouched = (requestId: string, fieldKey: string) => {
    setTouched((prev) => ({
      ...prev,
      [requestId]: {
        ...prev[requestId],
        [fieldKey]: true,
      },
    }));
  };

  const getValue = (requestId: string, fieldKey: string) => {
    return values[requestId]?.[fieldKey];
  };

  const isMissing = (requestId: string, field: IntelField) => {
    if (!field.required) return false;
    const value = getValue(requestId, field.key);
    if (field.type === 'checkbox' || field.type === 'boolean') return value !== true;
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || value === '';
  };

  const handleFileUpload = async (requestId: string, file: File) => {
    setUploadState((prev) => ({
      ...prev,
      [requestId]: { status: 'uploading' },
    }));

    try {
      await uploadIntelFile(engagementId, requestId, file);
      setUploadState((prev) => ({
        ...prev,
        [requestId]: { status: 'success', message: 'Uploaded.' },
      }));
    } catch (err: unknown) {
      if (err instanceof ApiResponseError) {
        setUploadState((prev) => ({
          ...prev,
          [requestId]: { status: 'error', message: formatError(err.status) },
        }));
      } else {
        setUploadState((prev) => ({
          ...prev,
          [requestId]: { status: 'error', message: formatError() },
        }));
      }
    }
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.6s_ease-out]">
      <header className="flex items-center justify-between border-b border-white/10 pb-5">
        <div>
          <p className={label.micro}>Intel Node</p>
          <h1 className="text-2xl font-semibold uppercase tracking-wider">
            Engagement {engagementId}
          </h1>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <section className={`overflow-hidden ${surface.panel}`}>
          <div className={`border-b border-white/10 px-4 py-3 text-sm font-medium ${text.muted}`}>
            Intel Requests
          </div>
          {loading ? (
            <div className={`px-4 py-6 text-sm ${text.muted}`}>Loading…</div>
          ) : error ? (
            <div className="px-4 py-6 text-sm text-rose-300">{error}</div>
          ) : requests.length === 0 ? (
            <div className={`px-4 py-6 text-sm ${text.muted}`}>No intel requests.</div>
          ) : (
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto custom-scrollbar">
              <ul className="divide-y divide-white/5">
                {requests.map((request) => {
                  const isSelected = request.id === selectedId;
                  const badgeClass =
                    statusStyles[request.status] ?? 'bg-white/5 text-gray-200 border-white/10';

                  return (
                    <li key={request.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(request.id)}
                        className={`w-full px-4 py-4 text-left ${glow.indigoHover} transform transition duration-300 hover:-translate-y-1 ${
                          isSelected ? 'bg-white/5' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-100">
                              {request.title ?? request.id}
                              {request.required ? (
                                <span className={`ml-2 ${label.micro} text-amber-300`}>
                                  ★ Required
                                </span>
                              ) : null}
                            </p>
                            {request.description ? (
                              <p className={`mt-1 text-xs ${text.muted}`}>{request.description}</p>
                            ) : null}
                          </div>
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-widest ${badgeClass}`}
                          >
                            {request.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className={surface.panel}>
          {!selectedRequest ? (
            <div className={`px-6 py-10 text-sm ${text.muted}`}>
              Select an intel request to view details.
            </div>
          ) : (
            <div className="px-8 py-8 md:px-10 md:py-10">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                  <p className={label.micro}>Intel Request</p>
                  <h2 className="text-2xl font-semibold uppercase tracking-wider">
                    {selectedRequest.title ?? 'Intel Request'}
                  </h2>
                  <p className={`mt-1 text-xs ${text.muted}`}>ID: {selectedRequest.id}</p>
                  {selectedRequest.description ? (
                    <p className={`mt-3 text-sm ${text.muted}`}>{selectedRequest.description}</p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest ${
                    statusStyles[selectedRequest.status] ??
                    'bg-white/5 text-gray-200 border-white/10'
                  }`}
                >
                  {selectedRequest.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="mt-8 space-y-6">
                {selectedRequest.fields?.length ? (
                  selectedRequest.fields.map((field) => {
                    const value = getValue(selectedRequest.id, field.key);
                    const missing = isMissing(selectedRequest.id, field);
                    const hasTouched = touched[selectedRequest.id]?.[field.key];
                    const showError = missing && hasTouched;

                    const commonProps = {
                      id: field.key,
                      name: field.key,
                      className: `${surface.input} w-full px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none`,
                      onBlur: () => markTouched(selectedRequest.id, field.key),
                    };

                    return (
                      <div key={field.id ?? field.key} className="space-y-2">
                        <label htmlFor={field.key} className={label.micro}>
                          {field.label}
                          {field.required ? (
                            <span className={`ml-2 ${label.micro} text-amber-300`}>★ Required</span>
                          ) : null}
                        </label>

                        {field.type === 'textarea' ? (
                          <textarea
                            {...commonProps}
                            rows={4}
                            value={(value as string) ?? ''}
                            onChange={(event) =>
                              updateValue(selectedRequest.id, field.key, event.target.value)
                            }
                          />
                        ) : field.type === 'select' ? (
                          <select
                            {...commonProps}
                            value={(value as string) ?? ''}
                            onChange={(event) =>
                              updateValue(selectedRequest.id, field.key, event.target.value)
                            }
                          >
                            <option value="">Select</option>
                            {field.options?.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : field.type === 'multiselect' ? (
                          <select
                            {...commonProps}
                            multiple
                            value={(value as string[]) ?? []}
                            onChange={(event) =>
                              updateValue(
                                selectedRequest.id,
                                field.key,
                                Array.from(event.target.selectedOptions).map(
                                  (option) => option.value,
                                ),
                              )
                            }
                          >
                            {field.options?.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : field.type === 'checkbox' || field.type === 'boolean' ? (
                          <label className={`flex items-center gap-3 px-3 py-2 ${surface.input}`}>
                            <input
                              type="checkbox"
                              checked={value === true}
                              onChange={(event) =>
                                updateValue(selectedRequest.id, field.key, event.target.checked)
                              }
                              onBlur={() => markTouched(selectedRequest.id, field.key)}
                              className="h-4 w-4 rounded border-white/20 bg-[#080808] text-indigo-500"
                            />
                            <span className="text-sm text-gray-200">Confirm</span>
                          </label>
                        ) : field.type === 'file' ? (
                          <div className="space-y-3">
                            <input
                              type="file"
                              className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-500/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-200 hover:file:bg-indigo-500/20"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  handleFileUpload(selectedRequest.id, file);
                                }
                              }}
                            />
                            {uploadState[selectedRequest.id]?.status === 'uploading' ? (
                              <p className="text-[11px] font-mono text-gray-400 animate-pulse">
                                Uploading…
                              </p>
                            ) : uploadState[selectedRequest.id]?.status === 'success' ? (
                              <p className="text-[11px] font-mono text-emerald-300">
                                {uploadState[selectedRequest.id]?.message}
                              </p>
                            ) : uploadState[selectedRequest.id]?.status === 'error' ? (
                              <p className="text-[11px] font-mono text-rose-300">
                                {uploadState[selectedRequest.id]?.message}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <input
                            {...commonProps}
                            type={
                              field.type === 'number'
                                ? 'number'
                                : field.type === 'date'
                                  ? 'date'
                                  : field.type === 'email'
                                    ? 'email'
                                    : field.type === 'url'
                                      ? 'url'
                                      : 'text'
                            }
                            value={(value as string) ?? ''}
                            onChange={(event) =>
                              updateValue(selectedRequest.id, field.key, event.target.value)
                            }
                          />
                        )}

                        {field.description ? (
                          <p className={`text-xs ${text.muted}`}>{field.description}</p>
                        ) : null}
                        {showError ? (
                          <p className="text-xs text-rose-300">Required field.</p>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className={`text-sm ${text.muted}`}>No fields available.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
