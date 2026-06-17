import { connect } from 'cloudflare:sockets';
import { EMAIL_OTP_TTL_SECONDS } from './constants';
import { randomToken, sha256Hex } from '../utils/crypto';

type EmailOtpRecord = {
  userId: string;
  email: string;
  otpHash: string;
  expiresAt: string;
  attempts: number;
};

type EmailDeliveryResult = {
  delivered: boolean;
  devOtp?: string;
};

type SmtpSecureMode = 'off' | 'on' | 'starttls';

type SmtpConfig = {
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  from?: string;
  secure?: string;
};

function otpKey(email: string): string {
  return `email_otp:${email.toLowerCase()}`;
}

function generateOtp(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

async function sendOtpEmail(params: {
  smtp: SmtpConfig;
  to: string;
  otp: string;
}): Promise<EmailDeliveryResult> {
  if (!params.smtp.host || !params.smtp.username || !params.smtp.password) {
    if (import.meta.env.PROD) {
      throw new Error('SMTP belum dikonfigurasi.');
    }
    console.info(`[ValueLoop] OTP verifikasi untuk ${params.to}: ${params.otp}`);
    return { delivered: false, devOtp: params.otp };
  }

  await sendSmtpMail({
    smtp: params.smtp,
    to: params.to,
    subject: 'Kode verifikasi ValueLoop',
    text: `Kode verifikasi ValueLoop Anda adalah ${params.otp}. Kode berlaku selama 10 menit.`,
  });

  return { delivered: true };
}

function normalizeSecureMode(value: string | undefined, port: number): SmtpSecureMode {
  if (value === 'on' || value === 'true' || value === 'tls') {
    return 'on';
  }
  if (value === 'off' || value === 'false' || value === 'none') {
    return 'off';
  }
  if (value === 'starttls') {
    return 'starttls';
  }
  return port === 465 ? 'on' : 'starttls';
}

function smtpAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function formatMailData(params: { from: string; to: string; subject: string; text: string }): string {
  const safeSubject = params.subject.replace(/\r|\n/g, ' ');
  const safeText = params.text.replace(/\r?\n/g, '\r\n');
  return [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    safeText,
  ].join('\r\n');
}

async function sendSmtpMail(params: {
  smtp: SmtpConfig;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const host = params.smtp.host as string;
  const port = Number(params.smtp.port || 587);
  if (port === 25) {
    throw new Error('Port SMTP 25 tidak didukung di Cloudflare Workers. Gunakan 465 atau 587.');
  }

  const secureMode = normalizeSecureMode(params.smtp.secure, port);
  const from = params.smtp.from || params.smtp.username || 'ValueLoop <no-reply@valueloop.local>';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let socket = connect(
    { hostname: host, port },
    { secureTransport: secureMode === 'on' ? 'on' : secureMode === 'starttls' ? 'starttls' : 'off', allowHalfOpen: false }
  );
  await socket.opened;
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  let buffer = '';

  const readResponse = async (): Promise<string> => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        throw new Error('Koneksi SMTP ditutup sebelum respons selesai.');
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      const lastLine = lines.findLast((line) => /^\d{3} /.test(line));
      if (lastLine) {
        const response = buffer;
        buffer = '';
        const code = Number(lastLine.slice(0, 3));
        if (code >= 400) {
          throw new Error(`SMTP error: ${lastLine}`);
        }
        return response;
      }
    }
  };

  const command = async (line: string) => {
    await writer.write(encoder.encode(`${line}\r\n`));
    return readResponse();
  };

  try {
    await readResponse();
    await command(`EHLO ${host}`);

    if (secureMode === 'starttls') {
      await command('STARTTLS');
      writer.releaseLock();
      reader.releaseLock();
      socket = socket.startTls();
      await socket.opened;
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
      buffer = '';
      await command(`EHLO ${host}`);
    }

    await command('AUTH LOGIN');
    await command(encodeBase64(params.smtp.username as string));
    await command(encodeBase64(params.smtp.password as string));
    await command(`MAIL FROM:<${smtpAddress(from)}>`);
    await command(`RCPT TO:<${smtpAddress(params.to)}>`);
    await command('DATA');
    await writer.write(encoder.encode(`${formatMailData({ from, to: params.to, subject: params.subject, text: params.text })}\r\n.\r\n`));
    await readResponse();
    await command('QUIT');
  } finally {
    try {
      writer.releaseLock();
    } catch {}
    try {
      reader.releaseLock();
    } catch {}
    await socket.close();
  }
}

export async function createEmailVerificationOtp(
  kv: KVNamespace,
  payload: {
    userId: string;
    email: string;
    smtp: SmtpConfig;
  }
): Promise<EmailDeliveryResult> {
  const otp = generateOtp();
  const record: EmailOtpRecord = {
    userId: payload.userId,
    email: payload.email.toLowerCase(),
    otpHash: await sha256Hex(`${payload.email.toLowerCase()}:${otp}`),
    expiresAt: new Date(Date.now() + EMAIL_OTP_TTL_SECONDS * 1000).toISOString(),
    attempts: 0,
  };

  await kv.put(otpKey(payload.email), JSON.stringify(record), {
    expirationTtl: EMAIL_OTP_TTL_SECONDS,
  });

  return sendOtpEmail({
    smtp: payload.smtp,
    to: payload.email,
    otp,
  });
}

export async function verifyEmailOtp(
  kv: KVNamespace,
  payload: { email: string; otp: string }
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const key = otpKey(payload.email);
  const raw = await kv.get(key);
  if (!raw) {
    return { ok: false, message: 'Kode verifikasi tidak valid atau sudah kedaluwarsa.' };
  }

  const record = JSON.parse(raw) as EmailOtpRecord;
  if (record.expiresAt <= new Date().toISOString()) {
    await kv.delete(key);
    return { ok: false, message: 'Kode verifikasi sudah kedaluwarsa.' };
  }

  if (record.attempts >= 5) {
    await kv.delete(key);
    return { ok: false, message: 'Terlalu banyak percobaan verifikasi. Minta kode baru.' };
  }

  const expectedHash = await sha256Hex(`${payload.email.toLowerCase()}:${payload.otp.trim()}`);
  if (expectedHash !== record.otpHash) {
    record.attempts += 1;
    await kv.put(key, JSON.stringify(record), {
      expirationTtl: Math.max(60, Math.floor((new Date(record.expiresAt).getTime() - Date.now()) / 1000)),
    });
    return { ok: false, message: 'Kode verifikasi salah.' };
  }

  await kv.delete(key);
  return { ok: true, userId: record.userId };
}

export function createOAuthState(): string {
  return randomToken(24);
}
