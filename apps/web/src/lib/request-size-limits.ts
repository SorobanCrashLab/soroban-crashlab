import { NextResponse } from 'next/server';

export interface RequestSizeLimitConfig {
  maxBodySize?: number; // in bytes
  maxJsonSize?: number; // in bytes
  maxFormDataSize?: number; // in bytes
}

const DEFAULT_CONFIG: RequestSizeLimitConfig = {
  maxBodySize: parseInt(process.env.MAX_REQUEST_SIZE || '10485760', 10), // 10MB
  maxJsonSize: parseInt(process.env.MAX_JSON_SIZE || '5242880', 10), // 5MB
  maxFormDataSize: parseInt(process.env.MAX_FORM_DATA_SIZE || '104857600', 10), // 100MB
};

export function checkRequestSize(
  request: Request,
  config: RequestSizeLimitConfig = DEFAULT_CONFIG,
): NextResponse | null {
  const contentLength = request.headers.get('content-length');

  if (!contentLength) {
    return null; // No size limit check possible without content-length
  }

  const size = parseInt(contentLength, 10);
  const contentType = request.headers.get('content-type') || '';

  if (size > (config.maxBodySize || DEFAULT_CONFIG.maxBodySize!)) {
    return NextResponse.json(
      { error: `Request body exceeds maximum allowed size of ${config.maxBodySize} bytes` },
      { status: 413 },
    );
  }

  if (contentType.includes('application/json') && size > (config.maxJsonSize || DEFAULT_CONFIG.maxJsonSize!)) {
    return NextResponse.json(
      { error: `JSON payload exceeds maximum allowed size of ${config.maxJsonSize} bytes` },
      { status: 413 },
    );
  }

  if (contentType.includes('multipart/form-data') && size > (config.maxFormDataSize || DEFAULT_CONFIG.maxFormDataSize!)) {
    return NextResponse.json(
      { error: `Form data exceeds maximum allowed size of ${config.maxFormDataSize} bytes` },
      { status: 413 },
    );
  }

  return null;
}
