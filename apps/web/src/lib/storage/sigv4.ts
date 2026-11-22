/**
 * AWS Signature Version 4 signing, hand-implemented (#1433).
 *
 * Why no SDK: `@aws-sdk/client-s3` pulls a large dependency tree of which this
 * app would use presigning and four verbs. SigV4 itself is a documented
 * canonical-request format plus four HMACs — small enough to own outright, and
 * pinned here against AWS's published test vectors. Keeping it in-tree also
 * keeps the no-dependency posture of the rest of `src/lib`.
 *
 * Credentials are only ever read server-side; nothing here is safe to import
 * into a client bundle.
 */

import { createHash, createHmac } from 'node:crypto';

export const SIGV4_ALGORITHM = 'AWS4-HMAC-SHA256';

/** S3 presigned URLs sign the payload as this literal rather than a digest. */
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface CanonicalRequestInput {
  method: string;
  /** Already-encoded path, beginning with `/`. */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  payloadHash: string;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * RFC 3986 encoding. `encodeURIComponent` leaves `!'()*` alone and AWS does
 * not, so those are escaped explicitly.
 */
export function uriEncode(value: string, encodeSlash = true): string {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return encodeSlash ? encoded : encoded.replace(/%2F/g, '/');
}

export function canonicalQueryString(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((key) => `${uriEncode(key)}=${uriEncode(query[key])}`)
    .join('&');
}

/**
 * Header names lowercased and sorted; values trimmed with runs of internal
 * whitespace collapsed, per the SigV4 spec.
 */
export function canonicalHeaders(headers: Record<string, string>): {
  canonical: string;
  signed: string;
} {
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return {
    canonical: entries.map(([name, value]) => `${name}:${value}\n`).join(''),
    signed: entries.map(([name]) => name).join(';'),
  };
}

export function buildCanonicalRequest(input: CanonicalRequestInput): {
  canonicalRequest: string;
  signedHeaders: string;
} {
  const { canonical, signed } = canonicalHeaders(input.headers);
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.path,
    canonicalQueryString(input.query),
    canonical,
    signed,
    input.payloadHash,
  ].join('\n');

  return { canonicalRequest, signedHeaders: signed };
}

export interface SigningScope {
  /** `YYYYMMDDTHHMMSSZ`. */
  amzDate: string;
  region: string;
  service: string;
}

/** `YYYYMMDD` — the date half of an `amzDate`. */
export function dateStamp(amzDate: string): string {
  return amzDate.slice(0, 8);
}

export function credentialScope(scope: SigningScope): string {
  return `${dateStamp(scope.amzDate)}/${scope.region}/${scope.service}/aws4_request`;
}

export function buildStringToSign(scope: SigningScope, canonicalRequest: string): string {
  return [
    SIGV4_ALGORITHM,
    scope.amzDate,
    credentialScope(scope),
    sha256Hex(canonicalRequest),
  ].join('\n');
}

/** The four-step derivation: date → region → service → `aws4_request`. */
export function deriveSigningKey(
  secretAccessKey: string,
  scope: SigningScope,
): Buffer {
  const hmac = (key: Buffer | string, data: string) =>
    createHmac('sha256', key).update(data, 'utf8').digest();

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp(scope.amzDate));
  const kRegion = hmac(kDate, scope.region);
  const kService = hmac(kRegion, scope.service);
  return hmac(kService, 'aws4_request');
}

export function calculateSignature(
  secretAccessKey: string,
  scope: SigningScope,
  stringToSign: string,
): string {
  return createHmac('sha256', deriveSigningKey(secretAccessKey, scope))
    .update(stringToSign, 'utf8')
    .digest('hex');
}

export interface SignedRequest {
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
  authorization: string;
  signedHeaders: string;
}

/** Signs a request with the `Authorization` header flow. */
export function signRequest(
  input: CanonicalRequestInput,
  credentials: SigV4Credentials,
  scope: SigningScope,
): SignedRequest {
  const { canonicalRequest, signedHeaders } = buildCanonicalRequest(input);
  const stringToSign = buildStringToSign(scope, canonicalRequest);
  const signature = calculateSignature(credentials.secretAccessKey, scope, stringToSign);

  const authorization =
    `${SIGV4_ALGORITHM} Credential=${credentials.accessKeyId}/${credentialScope(scope)}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { canonicalRequest, stringToSign, signature, authorization, signedHeaders };
}

export interface PresignInput {
  method: string;
  /** Object-store origin, e.g. `https://s3.us-east-1.amazonaws.com`. */
  endpoint: string;
  /** Encoded object path beginning with `/`, bucket included. */
  path: string;
  expiresInSeconds: number;
  query?: Record<string, string>;
}

/**
 * Builds a presigned URL: the signature travels in the query string, so the
 * browser can talk to the object store directly without ever seeing a secret.
 */
export function presignUrl(
  input: PresignInput,
  credentials: SigV4Credentials,
  scope: SigningScope,
): string {
  const host = new URL(input.endpoint).host;

  const query: Record<string, string> = {
    ...input.query,
    'X-Amz-Algorithm': SIGV4_ALGORITHM,
    'X-Amz-Credential': `${credentials.accessKeyId}/${credentialScope(scope)}`,
    'X-Amz-Date': scope.amzDate,
    'X-Amz-Expires': String(input.expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };

  if (credentials.sessionToken) {
    query['X-Amz-Security-Token'] = credentials.sessionToken;
  }

  const { canonicalRequest } = buildCanonicalRequest({
    method: input.method,
    path: input.path,
    query,
    headers: { host },
    payloadHash: UNSIGNED_PAYLOAD,
  });

  const signature = calculateSignature(
    credentials.secretAccessKey,
    scope,
    buildStringToSign(scope, canonicalRequest),
  );

  return `${input.endpoint.replace(/\/$/, '')}${input.path}?${canonicalQueryString(query)}&X-Amz-Signature=${signature}`;
}

/** `YYYYMMDDTHHMMSSZ` from a Date. */
export function toAmzDate(date: Date): string {
  return `${date.toISOString().replace(/[:-]|\.\d{3}/g, '')}`;
}
