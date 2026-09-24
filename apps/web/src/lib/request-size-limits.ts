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

/**
 * Standard 413 payload emitted by every route that enforces body size limits so
 * clients can rely on a uniform `code` when surfacing "payload too large" errors.
 */
export function standardSizeLimitResponse(
  message: string,
  limitBytes?: number,
  actualBytes?: number,
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: 'PAYLOAD_TOO_LARGE',
      ...(typeof limitBytes === 'number' ? { limit: limitBytes } : {}),
      ...(typeof actualBytes === 'number' ? { actual: actualBytes } : {}),
    },
    { status: 413 },
  );
}

export function checkRequestSize(
  request: Request,
  config: RequestSizeLimitConfig = DEFAULT_CONFIG,
): NextResponse | null {
  const contentLength = request.headers.get('content-length');

  if (!contentLength) {
    return null; // No size limit check possible without content-length
  }

  const size = parseInt(contentLength, 10);
  if (isNaN(size)) {
    return null;
  }

  const contentType = request.headers.get('content-type') || '';

  const maxBody = config.maxBodySize ?? DEFAULT_CONFIG.maxBodySize!;
  if (size > maxBody) {
    return standardSizeLimitResponse(
      `Request body exceeds maximum allowed size of ${maxBody} bytes`,
      maxBody,
      size,
    );
  }

  if (contentType.includes('application/json')) {
    const maxJson = config.maxJsonSize ?? DEFAULT_CONFIG.maxJsonSize!;
    if (size > maxJson) {
      return standardSizeLimitResponse(
        `JSON payload exceeds maximum allowed size of ${maxJson} bytes`,
        maxJson,
        size,
      );
    }
  }

  if (contentType.includes('multipart/form-data')) {
    const maxFormData = config.maxFormDataSize ?? DEFAULT_CONFIG.maxFormDataSize!;
    if (size > maxFormData) {
      return standardSizeLimitResponse(
        `Form data exceeds maximum allowed size of ${maxFormData} bytes`,
        maxFormData,
        size,
      );
    }
  }

  return null;
}
