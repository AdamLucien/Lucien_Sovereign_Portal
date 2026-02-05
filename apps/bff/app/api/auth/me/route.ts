import { errorResponse } from '../../../../lib/errors';
import { jsonResponse } from '../../../../lib/response';

const parseVisibility = (value: string | null): unknown => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

export async function GET(request: Request) {
  const headers = request.headers;
  const uid = headers.get('x-lucien-uid');
  const role = headers.get('x-lucien-role');
  const scopeHeader = headers.get('x-lucien-scope');

  if (!uid || !role) {
    return errorResponse(401, 'unauthenticated', 'Session required.');
  }

  const scopeValue = scopeHeader?.trim() ?? '';
  const scopeAll = scopeValue.toUpperCase() === 'ALL';
  const engagementIds = scopeAll
    ? []
    : scopeValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .sort();

  return jsonResponse({
    uid,
    role,
    engagementIds,
    scope: scopeAll ? 'ALL' : 'SCOPED',
    visibility: parseVisibility(headers.get('x-lucien-visibility')),
    jti: headers.get('x-lucien-jti'),
    user: {
      email: uid,
    },
  });
}
