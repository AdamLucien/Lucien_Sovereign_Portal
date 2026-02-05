import { errorResponse } from './errors';

export type JsonParseResult<T> = {
  data: T | null;
  error: ReturnType<typeof errorResponse> | null;
};

export const parseJsonBody = async <T>(
  request: Request,
  options: { maxBytes: number },
): Promise<JsonParseResult<T>> => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return {
      data: null,
      error: errorResponse(400, 'invalid_content_type', 'Expected application/json.'),
    };
  }

  const rawLength = request.headers.get('content-length');
  if (!rawLength) {
    return {
      data: null,
      error: errorResponse(411, 'length_required', 'Content-Length required.'),
    };
  }

  const contentLength = Number(rawLength);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return {
      data: null,
      error: errorResponse(411, 'length_required', 'Content-Length required.'),
    };
  }

  if (contentLength > options.maxBytes) {
    return {
      data: null,
      error: errorResponse(413, 'payload_too_large', `Payload exceeds ${options.maxBytes} bytes.`),
    };
  }

  try {
    const data = (await request.json()) as T;
    return { data, error: null };
  } catch {
    return {
      data: null,
      error: errorResponse(400, 'invalid_payload', 'Invalid JSON payload.'),
    };
  }
};
