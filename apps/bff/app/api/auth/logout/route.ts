import { clearSessionCookie } from '../../../../lib/auth';
import { jsonResponse } from '../../../../lib/response';

export async function POST() {
  const response = jsonResponse({ ok: true });
  return clearSessionCookie(response);
}
