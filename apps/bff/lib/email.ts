import nodemailer from 'nodemailer';

import 'server-only';

type InviteEmailPayload = {
  to: string;
  inviteLink?: string | null;
  temporaryPassword?: string | null;
  role: string;
  engagementIds: string[];
  expiresAt: string;
};

const smtpHost = process.env.SMTP_HOST?.trim();
const smtpUser = process.env.SMTP_USER?.trim();
const smtpPass = process.env.SMTP_PASS?.trim();
const smtpPort = Number.parseInt(process.env.SMTP_PORT ?? '587', 10);
const smtpFrom = process.env.SMTP_FROM?.trim() ?? 'no-reply@lucien.technology';

const canSend = Boolean(smtpHost && smtpUser && smtpPass);

export const sendInviteEmail = async (payload: InviteEmailPayload): Promise<boolean> => {
  if (!canSend) {
    console.warn('SMTP not configured; invite email not sent.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number.isFinite(smtpPort) ? smtpPort : 587,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

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

  await transporter.sendMail({
    from: smtpFrom,
    to: payload.to,
    subject: 'Lucien Portal Invite',
    text: lines.join('\n'),
  });

  return true;
};
