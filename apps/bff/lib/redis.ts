import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const isProd = process.env.NODE_ENV === 'production';
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

if (isProd && !isBuildPhase && (!redisUrl || !redisToken)) {
  throw new Error('Upstash Redis is required in production for rate limiting.');
}

const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

export type RateLimitResult = {
  count: number;
  remaining: number;
};

export const checkRateLimit = async (
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<RateLimitResult> => {
  if (!redis) {
    return { count: 0, remaining: limit };
  }

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  return {
    count,
    remaining: Math.max(limit - count, 0),
  };
};

export const redisClient = redis;
