import { NextResponse } from 'next/server';

type HeaderValue = string | number;

const SECURITY_HEADERS: Record<string, HeaderValue> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export const mergeSecurityHeaders = (headers?: HeadersInit) => {
  const merged = new Headers(headers);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    merged.set(key, String(value));
  });
  return merged;
};

export const applySecurityHeaders = (response: NextResponse) => {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, String(value));
  });
  return response;
};

export const jsonResponse = <T>(data: T, init?: ResponseInit) => {
  return NextResponse.json(data, {
    ...init,
    headers: mergeSecurityHeaders(init?.headers),
  });
};
