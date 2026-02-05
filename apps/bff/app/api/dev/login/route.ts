import { attachSessionCookie, createSessionToken } from '../../../../lib/auth';
import { errorResponse } from '../../../../lib/errors';
import { jsonResponse } from '../../../../lib/response';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse(403, 'dev_login_disabled', 'Dev login disabled.');
  }

  const response = jsonResponse({
    success: true,
    role: 'OPERATOR',
    engagementIds: ['PRJ-001'],
  });
  const { token, expiresIn } = await createSessionToken({
    email: 'adam@lucien.technology',
    role: 'OPERATOR',
    engagementIds: ['PRJ-001'],
    vis: 'ALL',
  });

  return attachSessionCookie(response, token, expiresIn);
}
