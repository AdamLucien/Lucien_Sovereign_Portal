export type Env = {
  DB: D1Database;
  EMAIL: SendEmail;
  INVITE_API_SECRET: string;
  LUCIEN_JWT_SECRET: string;
  PORTAL_BASE_URL?: string;
  INVITE_BASE_URL?: string;
  INVITE_EMAIL_FROM?: string;
  ERP_BASE_URL?: string;
  ERP_API_KEY?: string;
  ERP_API_SECRET?: string;
  LUCIEN_TIER_FIELD?: string;
};
