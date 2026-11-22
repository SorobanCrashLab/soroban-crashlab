import { describe, expect, it } from 'vitest';
import {
  buildCanonicalRequest,
  buildStringToSign,
  canonicalHeaders,
  canonicalQueryString,
  credentialScope,
  presignUrl,
  sha256Hex,
  signRequest,
  toAmzDate,
  uriEncode,
  UNSIGNED_PAYLOAD,
} from './sigv4';

/**
 * Vectors from AWS's published SigV4 test suite and the S3 query-parameter
 * signing example in the AWS docs. These are the correctness bedrock: the
 * driver is only trustworthy if these reproduce byte-for-byte.
 */
const SUITE_CREDENTIALS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

const SUITE_SCOPE = {
  amzDate: '20150830T123600Z',
  region: 'us-east-1',
  service: 'service',
};

const EMPTY_PAYLOAD_HASH = sha256Hex('');

describe('aws-sig-v4-test-suite: get-vanilla', () => {
  const input = {
    method: 'GET',
    path: '/',
    query: {},
    headers: { Host: 'example.amazonaws.com', 'X-Amz-Date': '20150830T123600Z' },
    payloadHash: EMPTY_PAYLOAD_HASH,
  };

  it('builds the documented canonical request', () => {
    expect(buildCanonicalRequest(input).canonicalRequest).toBe(
      [
        'GET',
        '/',
        '',
        'host:example.amazonaws.com',
        'x-amz-date:20150830T123600Z',
        '',
        'host;x-amz-date',
        EMPTY_PAYLOAD_HASH,
      ].join('\n'),
    );
  });

  it('builds the documented string to sign', () => {
    const { canonicalRequest } = buildCanonicalRequest(input);
    expect(buildStringToSign(SUITE_SCOPE, canonicalRequest)).toBe(
      [
        'AWS4-HMAC-SHA256',
        '20150830T123600Z',
        '20150830/us-east-1/service/aws4_request',
        sha256Hex(canonicalRequest),
      ].join('\n'),
    );
  });

  it('reproduces the published signature and Authorization header', () => {
    const signed = signRequest(input, SUITE_CREDENTIALS, SUITE_SCOPE);
    expect(signed.signature).toBe(
      '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    expect(signed.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });
});

describe('aws-sig-v4-test-suite: header and query canonicalisation', () => {
  it('collapses internal whitespace and trims header values', () => {
    const { canonical, signed } = canonicalHeaders({
      Host: 'example.amazonaws.com',
      'My-Header1': '  value1  value2  ',
    });
    expect(canonical).toBe('host:example.amazonaws.com\nmy-header1:value1 value2\n');
    expect(signed).toBe('host;my-header1');
  });

  it('sorts query parameters by key and encodes them', () => {
    expect(canonicalQueryString({ b: '2', a: '1', 'x y': 'p/q' })).toBe('a=1&b=2&x%20y=p%2Fq');
  });

  it('escapes the characters encodeURIComponent leaves alone', () => {
    expect(uriEncode("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af');
  });

  it('can leave path separators unescaped', () => {
    expect(uriEncode('runs/2026/artifact.zip', false)).toBe('runs/2026/artifact.zip');
  });
});

describe('S3 presigned canonical request shape', () => {
  /**
   * AWS publishes the algorithm for query-string auth but no literal signature
   * vector, so this pins the documented *shape* — UNSIGNED-PAYLOAD, host as the
   * only signed header, query sorted after encoding. The digest itself is
   * already proven by the get-vanilla vector above, which exercises the same
   * canonical-request, string-to-sign and signing-key code paths.
   */
  it('matches the documented layout for query-parameter authentication', () => {
    const scope = { amzDate: '20130524T000000Z', region: 'us-east-1', service: 's3' };
    const query = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `AKIAIOSFODNN7EXAMPLE/${credentialScope(scope)}`,
      'X-Amz-Date': scope.amzDate,
      'X-Amz-Expires': '86400',
      'X-Amz-SignedHeaders': 'host',
    };
    const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
      method: 'GET',
      path: '/test.txt',
      query,
      headers: { host: 'examplebucket.s3.amazonaws.com' },
      payloadHash: UNSIGNED_PAYLOAD,
    });

    expect(signedHeaders).toBe('host');
    expect(canonicalRequest).toBe(
      [
        'GET',
        '/test.txt',
        'X-Amz-Algorithm=AWS4-HMAC-SHA256' +
          '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
          '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host',
        'host:examplebucket.s3.amazonaws.com',
        '',
        'host',
        'UNSIGNED-PAYLOAD',
      ].join('\n'),
    );
  });
});

describe('presignUrl', () => {
  const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' };
  const scope = { amzDate: '20260101T000000Z', region: 'us-east-1', service: 's3' };

  it('puts every signing parameter in the query string and no secret in the URL', () => {
    const url = presignUrl(
      {
        method: 'PUT',
        endpoint: 'https://s3.us-east-1.amazonaws.com',
        path: '/bucket/runs/run-1.zip',
        expiresInSeconds: 900,
      },
      credentials,
      scope,
    );

    const parsed = new URL(url);
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url).not.toContain(credentials.secretAccessKey);
  });

  it('is deterministic for the same inputs and changes when any input changes', () => {
    const build = (path: string) =>
      presignUrl(
        { method: 'GET', endpoint: 'https://s3.us-east-1.amazonaws.com', path, expiresInSeconds: 900 },
        credentials,
        scope,
      );
    expect(build('/bucket/a')).toBe(build('/bucket/a'));
    expect(build('/bucket/a')).not.toBe(build('/bucket/b'));
  });

  it('carries a session token when one is configured', () => {
    const url = presignUrl(
      { method: 'GET', endpoint: 'https://s3.us-east-1.amazonaws.com', path: '/bucket/a', expiresInSeconds: 60 },
      { ...credentials, sessionToken: 'session-token-value' },
      scope,
    );
    expect(new URL(url).searchParams.get('X-Amz-Security-Token')).toBe('session-token-value');
  });
});

describe('toAmzDate', () => {
  it('formats a Date as YYYYMMDDTHHMMSSZ', () => {
    expect(toAmzDate(new Date('2026-08-26T09:07:05.123Z'))).toBe('20260826T090705Z');
  });
});
