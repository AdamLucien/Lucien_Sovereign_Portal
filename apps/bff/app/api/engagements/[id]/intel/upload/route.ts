import { erpClient, isERPClientError } from '../../../../../../lib/erp-client';
import { errorResponse } from '../../../../../../lib/errors';
import { checkRateLimit } from '../../../../../../lib/redis';
import { jsonResponse } from '../../../../../../lib/response';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;

const parseScope = (scopeHeader: string | null) => {
  if (!scopeHeader) return { all: false, ids: [] as string[] };
  const normalized = scopeHeader.trim();
  if (normalized.toUpperCase() === 'ALL') {
    return { all: true, ids: [] as string[] };
  }
  return {
    all: false,
    ids: normalized
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
};

const withRateHeaders = (
  response: import('next/server').NextResponse,
  limit: number,
  remaining: number,
): import('next/server').NextResponse => {
  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  return response;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: engagementId } = await params;
  const headers = request.headers;
  const role = headers.get('x-lucien-role');
  const uid = headers.get('x-lucien-uid');
  const scope = parseScope(headers.get('x-lucien-scope'));

  if (!uid) {
    return errorResponse(403, 'forbidden', 'Missing session context.');
  }

  const rateKey = `lucien:rl:uid:${uid}`;
  const rate = await checkRateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_SECONDS);

  if (rate.count > RATE_LIMIT) {
    const response = errorResponse(429, 'rate_limited', 'Too many uploads.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  if (role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    const response = errorResponse(403, 'forbidden', 'Engagement access denied.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  const contentType = headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    const response = errorResponse(400, 'invalid_content_type', 'Expected multipart/form-data.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  const contentLength = Number(headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    const response = errorResponse(411, 'length_required', 'Content-Length required.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  if (contentLength > MAX_UPLOAD_BYTES) {
    const response = errorResponse(413, 'payload_too_large', 'Upload exceeds 50MB.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const requestId = formData.get('requestId');

  if (!(file instanceof File)) {
    const response = errorResponse(400, 'invalid_file', 'File is required.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const response = errorResponse(413, 'payload_too_large', 'Upload exceeds 50MB.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  if (typeof requestId !== 'string' || !/^REQ-[0-9A-Z-]+$/.test(requestId)) {
    const response = errorResponse(400, 'invalid_request_id', 'Invalid requestId.');
    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  }

  try {
    const clientRequest = await erpClient.fetchClientRequestById(requestId);
    if (!clientRequest) {
      const response = errorResponse(403, 'request_not_found', 'Request not found.');
      return withRateHeaders(response, RATE_LIMIT, rate.remaining);
    }

    if (clientRequest.project !== engagementId) {
      const response = errorResponse(403, 'forbidden', 'Engagement mismatch.');
      return withRateHeaders(response, RATE_LIMIT, rate.remaining);
    }

    if (role === 'CLIENT') {
      if (clientRequest.visibility !== 'client_visible') {
        const response = errorResponse(403, 'forbidden', 'Request not visible.');
        return withRateHeaders(response, RATE_LIMIT, rate.remaining);
      }

      if (clientRequest.status === 'accepted') {
        const response = errorResponse(403, 'forbidden', 'Request already accepted.');
        return withRateHeaders(response, RATE_LIMIT, rate.remaining);
      }
    }

    const uploadResponse = await erpClient.uploadFile({
      file,
      doctype: 'Client Request',
      docname: clientRequest.name,
    });

    await erpClient.updateClientRequestStatus(clientRequest.name, 'submitted');

    const response = jsonResponse({
      requestId: clientRequest.name,
      uploadId: uploadResponse.file.name,
      status: 'accepted',
      receivedAt: new Date().toISOString(),
    });

    return withRateHeaders(response, RATE_LIMIT, rate.remaining);
  } catch (error) {
    if (isERPClientError(error)) {
      const response = errorResponse(502, 'erp_unavailable', 'ERP request failed.');
      return withRateHeaders(response, RATE_LIMIT, rate.remaining);
    }
    throw error;
  }
}
