import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as nodemailer from 'nodemailer';
import {
  validateSmtpConfig,
  validateEmail,
  validateEmailMessage,
  sendEmail,
  verifySmtpConnection,
  createCriticalEventEmail,
  createRunEventEmail,
  type SmtpConfig,
  type EmailMessage,
} from './smtp-email';

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(),
}));

function makeConfig(overrides: Partial<SmtpConfig> = {}): SmtpConfig {
  return {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: { user: 'user@example.com', pass: 'super-secret' },
    from: 'alerts@example.com',
    enabled: true,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: 'recipient@example.com',
    subject: 'Test subject',
    text: 'Test body',
    ...overrides,
  };
}

describe('validateSmtpConfig', () => {
  it('accepts a valid config', () => {
    expect(validateSmtpConfig(makeConfig())).toBeNull();
  });

  it('rejects a missing host', () => {
    expect(validateSmtpConfig(makeConfig({ host: '' }))).toBe('SMTP host is required');
  });

  it('rejects an out-of-range port', () => {
    expect(validateSmtpConfig(makeConfig({ port: 0 }))).toBe(
      'SMTP port must be between 1 and 65535',
    );
    expect(validateSmtpConfig(makeConfig({ port: 70000 }))).toBe(
      'SMTP port must be between 1 and 65535',
    );
  });

  it('rejects an invalid from address', () => {
    expect(validateSmtpConfig(makeConfig({ from: 'not-an-email' }))).toBe(
      'Invalid from email address',
    );
  });
});

describe('validateEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(validateEmail('a@b.com')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(validateEmail('not-an-email')).toBe(false);
  });
});

describe('validateEmailMessage', () => {
  it('accepts a valid message', () => {
    expect(validateEmailMessage(makeMessage())).toBeNull();
  });

  it('rejects a message with no recipients', () => {
    expect(validateEmailMessage(makeMessage({ to: [] }))).toBe(
      'Recipient email address is required',
    );
  });

  it('rejects a message with neither text nor html', () => {
    expect(
      validateEmailMessage({ to: 'a@b.com', subject: 'Subject' }),
    ).toBe('Email must have either text or HTML content');
  });
});

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends via nodemailer.createTransport().sendMail() on a valid config/message', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<abc123@example.com>' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    const result = await sendEmail(makeConfig(), makeMessage());

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587, secure: false }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'alerts@example.com', to: 'recipient@example.com' }),
    );
    expect(result).toEqual({ success: true, messageId: '<abc123@example.com>' });
  });

  it('returns a failure result without calling nodemailer when config is invalid', async () => {
    const result = await sendEmail(makeConfig({ host: '' }), makeMessage());
    expect(result.success).toBe(false);
    expect(result.error).toBe('SMTP host is required');
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('returns a failure result without calling nodemailer when message is invalid', async () => {
    const result = await sendEmail(makeConfig(), makeMessage({ subject: '' }));
    expect(result.success).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('surfaces a transport error as a failure result', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    const result = await sendEmail(makeConfig(), makeMessage());
    expect(result).toEqual({
      success: false,
      error: 'Failed to send email: Connection refused',
    });
  });
});

describe('verifySmtpConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when transporter.verify() resolves', async () => {
    const verify = vi.fn().mockResolvedValue(true);
    vi.mocked(nodemailer.createTransport).mockReturnValue({ verify } as never);

    const result = await verifySmtpConnection(makeConfig());
    expect(result).toEqual({ success: true });
  });

  it('returns a failure result when transporter.verify() rejects', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('Invalid login'));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ verify } as never);

    const result = await verifySmtpConnection(makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toBe('SMTP connection failed: Invalid login');
  });

  it('returns a failure result without calling nodemailer when config is invalid', async () => {
    const result = await verifySmtpConnection(makeConfig({ auth: { user: '', pass: '' } }));
    expect(result.success).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});

describe('createCriticalEventEmail', () => {
  it('builds a subject, text, and html body', () => {
    const result = createCriticalEventEmail('run_failed', 'Run xyz failed', 'Details here', {
      runId: 'run-1',
    });
    expect(result.subject).toContain('CRITICAL');
    expect(result.text).toContain('Run xyz failed');
    expect(result.html).toContain('Run xyz failed');
    expect(result.text).toContain('runId: run-1');
  });
});

describe('createRunEventEmail', () => {
  it('builds a subject, text, and html body', () => {
    const result = createRunEventEmail('failed', 'run-42');
    expect(result.subject).toContain('run-42');
    expect(result.text).toContain('run-42');
    expect(result.html).toContain('run-42');
  });
});

describe('sendBatchEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends each message and returns one result per message', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<batch@example.com>' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    const config = makeConfig();
    const results = await Promise.all([
      sendEmail(config, makeMessage({ to: 'a@example.com' })),
      sendEmail(config, makeMessage({ to: 'b@example.com' })),
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
