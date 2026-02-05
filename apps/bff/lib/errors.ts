import { NextResponse } from 'next/server';

import { mergeSecurityHeaders } from './response';

export type GatewayErrorStatus = 400 | 401 | 403 | 404 | 411 | 413 | 429 | 500 | 501 | 502;

export const errorResponse = (
  status: GatewayErrorStatus,
  code: string,
  reason: string,
  error = 'gateway_error',
  headers?: HeadersInit,
) => {
  return NextResponse.json(
    {
      error,
      code,
      reason,
    },
    { status, headers: mergeSecurityHeaders(headers) },
  );
};
