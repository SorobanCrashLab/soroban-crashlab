import { NextResponse } from 'next/server';

export interface ApiSuccessResponse<T> {
  data: T;
  total?: number;
}

export interface ApiErrorResponse {
  error: string;
}

export function successResponse<T>(data: T, init?: { total?: number; status?: number }): NextResponse {
  const body: ApiSuccessResponse<T> = { data };
  if (init?.total !== undefined) {
    body.total = init.total;
  }
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function errorResponse(error: string, status: number = 500): NextResponse {
  return NextResponse.json({ error } satisfies ApiErrorResponse, { status });
}

export function createdResponse<T>(data: T): NextResponse {
  return successResponse(data, { status: 201 });
}

export const status = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  unprocessableEntity: 422,
  conflict: 409,
  internalError: 500,
  badGateway: 502,
  serviceUnavailable: 503,
} as const;