export type Env = {
  DB: D1Database;
  INVITE_API_SECRET: string;
  LUCIEN_JWT_SECRET: string;
  BREVO_API_KEY?: string;
  PAYMENT_LINK_TEMPLATE?: string;
  PORTAL_BASE_URL?: string;
  INVITE_BASE_URL?: string;
  INVITE_EMAIL_FROM?: string;
  INVITE_EMAIL_FROM_NAME?: string;
  ERP_BASE_URL?: string;
  ERP_API_KEY?: string;
  ERP_API_SECRET?: string;
  LUCIEN_TIER_FIELD?: string;
};
