/**
 * SMTP connect/greeting/socket timeouts (#1633), exercised against a fake
 * server that accepts the TCP connection but never sends the 220 greeting —
 * the "hung SMTP handshake" that used to hold a function to its limit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as net from 'node:net';
import * as nodemailer from 'nodemailer';
import { buildSmtpTransportOptions, SMTP_TIMEOUTS, type SmtpConfig } from './smtp-email';

const config = (port: number): SmtpConfig => ({
  host: '127.0.0.1',
  port,
  secure: false,
  auth: { user: 'user@example.com', pass: 'secret' },
  from: 'alerts@example.com',
  enabled: true,
});

let silent: net.Server;
let port: number;
const sockets = new Set<net.Socket>();

beforeAll(async () => {
  silent = net.createServer((socket) => {
    sockets.add(socket); // accept, then say nothing
  });
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  port = (silent.address() as net.AddressInfo).port;
});

afterAll(async () => {
  sockets.forEach((socket) => socket.destroy());
  await new Promise<void>((resolve) => silent.close(() => resolve()));
});

describe('SMTP transport timeouts', () => {
  it('always sets connection, greeting and socket timeouts well under the function limit', () => {
    const options = buildSmtpTransportOptions(config(587));
    expect(options).toMatchObject(SMTP_TIMEOUTS);
    for (const value of Object.values(SMTP_TIMEOUTS)) expect(value).toBeLessThan(10_000);
  });

  it('fails a silent server at the greeting timeout instead of hanging', async () => {
    const transporter = nodemailer.createTransport(
      buildSmtpTransportOptions(config(port), { connectionTimeout: 200, greetingTimeout: 200, socketTimeout: 400 }),
    );
    const started = Date.now();

    await expect(transporter.verify()).rejects.toThrow(/greeting|timeout/i);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
