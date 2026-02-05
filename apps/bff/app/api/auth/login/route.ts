import { attachSessionCookie, authenticateUser, createSessionToken } from '../../../../lib/auth';
import { errorResponse } from '../../../../lib/errors';
import { parseJsonBody } from '../../../../lib/request';
import { jsonResponse } from '../../../../lib/response';

const MAX_LOGIN_BODY_BYTES = 10 * 1024;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;

export async function POST(request: Request) {
  const { data, error } = await parseJsonBody<{ email?: string; password?: string }>(request, {
    maxBytes: MAX_LOGIN_BODY_BYTES,
  });
  if (error) return error;

  const email = data?.email?.trim() ?? '';
  const password = data?.password ?? '';

  if (!email || !password) {
    return errorResponse(400, 'invalid_payload', 'Email and password required.');
  }

  if (email.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return errorResponse(400, 'invalid_payload', 'Invalid credentials payload.');
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    return errorResponse(401, 'invalid_credentials', 'Invalid credentials.');
  }

  const { token, expiresIn } = await createSessionToken(user);
  const response = jsonResponse({
    ok: true,
    role: user.role,
    engagementIds: user.engagementIds,
    user: {
      email: user.email,
      name: user.name ?? null,
    },
  });

  return attachSessionCookie(response, token, expiresIn);
}
