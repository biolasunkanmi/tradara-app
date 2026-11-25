import { createHash, randomBytes } from 'crypto';
import { Request, Response } from 'express';

export const GUEST_COOKIE_NAME = 'tradara_guest';
export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function guestOwnerId(token: string): string {
  return `guest:${hashGuestToken(token)}`;
}

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.headers.cookie;
  if (!cookies) return undefined;

  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function resolveGuestIdentity(req: Request, res: Response): string {
  const existing = readCookie(req, GUEST_COOKIE_NAME);
  if (existing && /^[a-f0-9]{64}$/i.test(existing)) {
    return guestOwnerId(existing);
  }

  const token = randomBytes(32).toString('hex');
  res.cookie(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: GUEST_TTL_MS,
    path: '/',
  });
  return guestOwnerId(token);
}
