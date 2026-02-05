import type { Env } from './env';

type InviteEmailPayload = {
  to: string;
  inviteLink?: string | null;
  temporaryPassword?: string | null;
  role: string;
  engagementIds: string[];
  expiresAt: string;
};

export const sendInviteEmail = async (env: Env, payload: InviteEmailPayload) => {
  const apiKey = env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured.');
  }
  const senderEmail = env.INVITE_EMAIL_FROM?.trim() ?? 'company@lucien.technology';
  const senderName = env.INVITE_EMAIL_FROM_NAME?.trim() ?? 'Lucien Portal';

  const lines = [
    'You have been invited to the Lucien portal.',
    '',
    `Role: ${payload.role}`,
    `Engagements: ${payload.engagementIds.join(', ') || 'N/A'}`,
    `Invite expires: ${payload.expiresAt}`,
  ];

  if (payload.inviteLink) {
    lines.push('', `Magic link: ${payload.inviteLink}`);
  }

  if (payload.temporaryPassword) {
    lines.push('', `Temporary password: ${payload.temporaryPassword}`);
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: payload.to }],
      subject: 'Lucien Portal Invite',
      textContent: lines.join('\n'),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Brevo send failed: ${response.status} ${details.slice(0, 500)}`);
  }
};
