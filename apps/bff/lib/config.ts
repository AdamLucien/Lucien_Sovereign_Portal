const isProd = process.env.NODE_ENV === 'production';

const allowDevJwtFallback = process.env.ALLOW_DEV_JWT_FALLBACK?.toLowerCase() === 'true';

const rawJwtSecret = process.env.LUCIEN_JWT_SECRET?.trim();

export const getJwtSecret = (): string => {
  if (rawJwtSecret) return rawJwtSecret;
  if (!isProd && allowDevJwtFallback) return 'dev-secret';
  throw new Error(
    'LUCIEN_JWT_SECRET is required' +
      (isProd ? ' in production.' : '. Set it explicitly or enable ALLOW_DEV_JWT_FALLBACK.'),
  );
};

export const isProduction = () => isProd;
