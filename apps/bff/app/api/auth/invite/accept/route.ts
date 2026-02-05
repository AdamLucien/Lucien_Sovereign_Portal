import { attachSessionCookie, createSessionToken } from '../../../../../lib/auth';
import { consumeInviteToken } from '../../../../../lib/auth-store';
import { errorResponse } from '../../../../../lib/errors';
import { parseJsonBody } from '../../../../../lib/request';
import { jsonResponse } from '../../../../../lib/response';

const MAX_ACCEPT_BODY_BYTES = 4 * 1024;

export async function POST(request: Request) {
  const { data, error } = await parseJsonBody<{ token?: string }>(request, {
    maxBytes: MAX_ACCEPT_BODY_BYTES,
  });
  if (error) return error;

  const token = data?.token?.trim() ?? '';
  if (!token) {
    return errorResponse(400, 'invalid_payload', 'Invite token required.');
  }

  const result = consumeInviteToken(token);
  if (!result) {
    return errorResponse(401, 'invalid_invite', 'Invite token invalid or expired.');
  }

  const { user } = result;
  const { token: sessionToken, expiresIn } = await createSessionToken({
    email: user.email,
    role: user.role,
    engagementIds: user.engagementIds,
    name: user.name ?? null,
    vis: user.vis ?? null,
  });

  const response = jsonResponse({
    ok: true,
    user: {
      email: user.email,
      name: user.name ?? null,
      role: user.role,
      engagementIds: user.engagementIds,
    },
  });

  return attachSessionCookie(response, sessionToken, expiresIn);
}
