import { createInvite } from '../../../../lib/auth-store';
import { sendInviteEmail } from '../../../../lib/email';
import { isValidEngagementId, normalizeEngagementIds } from '../../../../lib/engagements';
import { errorResponse } from '../../../../lib/errors';
import { parseJsonBody } from '../../../../lib/request';
import { jsonResponse } from '../../../../lib/response';

const MAX_INVITE_BODY_BYTES = 20 * 1024;
const MAX_EMAIL_LENGTH = 254;

const requireInviteSecret = (request: Request) => {
  const secret = process.env.INVITE_API_SECRET?.trim();
  if (!secret) {
    return errorResponse(500, 'invite_secret_missing', 'Invite secret not configured.');
  }
  const provided = request.headers.get('x-invite-secret');
  if (provided !== secret) {
    return errorResponse(403, 'forbidden', 'Invalid invite secret.');
  }
  return null;
};

export async function POST(request: Request) {
  const authError = requireInviteSecret(request);
  if (authError) return authError;

  const { data, error } = await parseJsonBody<{
    email?: string;
    role?: string;
    engagementIds?: string[];
    name?: string | null;
    vis?: unknown;
    type?: 'magic' | 'temp_password';
    expiresInHours?: number;
    sendEmail?: boolean;
    inviteBaseUrl?: string;
  }>(request, { maxBytes: MAX_INVITE_BODY_BYTES });

  if (error) return error;

  const email = data?.email?.trim().toLowerCase() ?? '';
  const role = data?.role?.toUpperCase() ?? 'CLIENT';
  const engagementIds = Array.isArray(data?.engagementIds)
    ? normalizeEngagementIds(data!.engagementIds.map((value) => String(value)))
    : [];

  if (!email || email.length > MAX_EMAIL_LENGTH) {
    return errorResponse(400, 'invalid_payload', 'Valid email required.');
  }

  if (role !== 'CLIENT' && role !== 'OPERATOR') {
    return errorResponse(400, 'invalid_payload', 'Invalid role.');
  }

  if (engagementIds.length === 0) {
    return errorResponse(400, 'invalid_payload', 'engagementIds required.');
  }

  const invalidIds = engagementIds.filter((id) => id !== 'ALL' && !isValidEngagementId(id));
  if (invalidIds.length) {
    return errorResponse(400, 'invalid_payload', `Invalid engagementIds: ${invalidIds.join(', ')}`);
  }

  const inviteBaseUrl =
    data?.inviteBaseUrl?.trim() ??
    process.env.INVITE_BASE_URL?.trim() ??
    process.env.PORTAL_BASE_URL?.trim();

  const { invite, token, tempPassword } = createInvite({
    email,
    role,
    engagementIds,
    name: data?.name ?? null,
    vis: data?.vis ?? null,
    type: data?.type ?? 'magic',
    expiresInHours: data?.expiresInHours,
  });

  let inviteLink: string | null = null;
  if (invite.type === 'magic') {
    if (!inviteBaseUrl) {
      return errorResponse(500, 'invite_base_url_missing', 'Invite base URL missing.');
    }
    inviteLink = new URL(`/invite?token=${encodeURIComponent(token)}`, inviteBaseUrl).toString();
  }

  const shouldSend = data?.sendEmail !== false;
  const emailSent = shouldSend
    ? await sendInviteEmail({
        to: email,
        inviteLink,
        temporaryPassword: tempPassword,
        role: invite.role,
        engagementIds: invite.engagementIds,
        expiresAt: invite.expiresAt,
      })
    : false;

  return jsonResponse({
    ok: true,
    inviteId: invite.id,
    email: invite.email,
    type: invite.type,
    expiresAt: invite.expiresAt,
    inviteLink,
    emailSent,
    temporaryPassword: shouldSend ? undefined : (tempPassword ?? undefined),
  });
}
