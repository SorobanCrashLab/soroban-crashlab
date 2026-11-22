import { describe, it, expect } from 'vitest';
import { recordEmailLogEntry } from '@/lib/integrations/smtp-store';
import { GET } from './route';

describe('/api/integrations/smtp/history', () => {
  it('returns 200 with an empty array when nothing has been sent yet', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.history).toEqual([]);
  });

  it('reflects recorded entries, most recent first', async () => {
    recordEmailLogEntry({
      id: '1',
      to: 'a@example.com',
      subject: 'A',
      status: 'sent',
      sentAt: new Date().toISOString(),
      messageId: '<a@example.com>',
    });
    recordEmailLogEntry({
      id: '2',
      to: 'b@example.com',
      subject: 'B',
      status: 'failed',
      sentAt: new Date().toISOString(),
      error: 'boom',
    });

    const response = await GET();
    const json = await response.json();
    expect(json.data.history.map((e: { id: string }) => e.id)).toEqual(['2', '1']);
  });
});
