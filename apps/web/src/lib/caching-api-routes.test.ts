import { describe, it, expect } from 'vitest';
import { GET as getArtifacts } from '../app/api/artifacts/route';
import { GET as getRuns } from '../app/api/runs/route';

describe('Caching and Conditional Headers in API Routes', () => {
  it('sets Cache-Control: no-store on GET /api/artifacts', async () => {
    const res = await getArtifacts();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets ETag and handles conditional request on GET /api/runs', async () => {
    const req1 = new Request('http://localhost/api/runs');
    const res1 = await getRuns(req1);
    expect(res1.status).toBe(200);

    const etag = res1.headers.get('ETag');
    expect(etag).toBeTruthy();

    const req2 = new Request('http://localhost/api/runs', {
      headers: { 'If-None-Match': etag! },
    });
    const res2 = await getRuns(req2);
    expect(res2.status).toBe(304);
  });
});
