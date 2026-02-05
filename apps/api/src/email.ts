import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

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
  const sender = env.INVITE_EMAIL_FROM ?? 'adam.karl.lucien@lucien.technology';
  const msg = createMimeMessage();
  msg.setSender({ addr: sender });
  msg.setRecipient(payload.to);
  msg.setSubject('Lucien Portal Invite');

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

  msg.addMessage({
    contentType: 'text/plain',
    data: lines.join('\n'),
  });

  await env.EMAIL.send(new EmailMessage(sender, payload.to, msg.asRaw()));
};
