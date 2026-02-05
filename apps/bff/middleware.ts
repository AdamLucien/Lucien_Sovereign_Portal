import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

import { auditSecurity } from './lib/audit';
import { getJwtSecret } from './lib/config';
import { errorResponse } from './lib/errors';
import { checkRateLimit } from './lib/redis';
import { parseLucienSession } from './lib/session';

const encoder = new TextEncoder();
const jwtSecret = getJwtSecret();

const rawRateLimit = Number.parseInt(process.env.LUCIEN_GLOBAL_IP_RATE_LIMIT ?? '120', 10);
const rawRateWindow = Number.parseInt(process.env.LUCIEN_GLOBAL_IP_RATE_WINDOW ?? '60', 10);
const globalRateLimit = Number.isFinite(rawRateLimit) ? rawRateLimit : 120;
const globalRateWindowSeconds = Number.isFinite(rawRateWindow) ? rawRateWindow : 60;

const getClientIp = (request: NextRequest): string => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return '0.0.0.0';
};

const extractEngagementId = (pathname: string): string | null => {
  const match = pathname.match(/^\/api\/engagements\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/dev/login')
  ) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const rateKey = `lucien:rl:global:ip:${ip}`;
  const rate = await checkRateLimit(rateKey, globalRateLimit, globalRateWindowSeconds);

  if (rate.count > globalRateLimit) {
    auditSecurity({
      event: 'rate_limit',
      ip,
      key: rateKey,
      count: rate.count,
    });
    return errorResponse(429, 'rate_limited', 'Too many requests.');
  }

  const token = request.cookies.get('lucien_session')?.value;
  const isAuthMe = pathname.startsWith('/api/auth/me');

  if (!token) {
    auditSecurity({ event: 'session_missing', ip });
    if (isAuthMe) {
      return NextResponse.next();
    }
    return errorResponse(401, 'session_missing', 'Missing lucien_session cookie.');
  }

  let sessionPayload;
  try {
    const verified = await jwtVerify(token, encoder.encode(jwtSecret));
    sessionPayload = verified.payload;
  } catch (error) {
    auditSecurity({ event: 'session_invalid', ip, error: String(error) });
    return errorResponse(401, 'session_invalid', 'Invalid session token.');
  }

  const session = parseLucienSession(sessionPayload);
  if (!session) {
    auditSecurity({ event: 'session_invalid', ip, reason: 'payload_invalid' });
    return errorResponse(401, 'session_invalid', 'Invalid session payload.');
  }

  const engagementId = extractEngagementId(pathname);

  if (session.role === 'CLIENT' && engagementId) {
    if (!session.engagementIds.includes(engagementId)) {
      auditSecurity({
        event: 'forbidden',
        ip,
        uid: session.uid,
        engagementId,
      });
      return errorResponse(403, 'forbidden', 'Engagement access denied.');
    }
  }

  const headers = new Headers(request.headers);
  const scopeValue = session.engagementIds.includes('ALL')
    ? 'ALL'
    : session.engagementIds.join(',');

  headers.set('X-Lucien-UID', session.uid);
  headers.set('X-Lucien-Role', session.role);
  headers.set('X-Lucien-Scope', scopeValue);
  headers.set(
    'X-Lucien-Visibility',
    typeof session.vis === 'string' ? session.vis : JSON.stringify(session.vis ?? null),
  );
  headers.set('X-Lucien-JTI', session.jti);

  if (scopeValue === 'ALL' && session.role === 'OPERATOR') {
    auditSecurity({ event: 'operator_bypass_used', uid: session.uid, jti: session.jti });
  }

  return NextResponse.next({
    request: {
      headers,
    },
  });
}

export const config = {
  matcher: ['/api/:path*'],
};
