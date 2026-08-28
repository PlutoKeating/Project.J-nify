import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

export const ADMIN_COOKIE = 'jnify_admin';
const MAX_AGE = 12 * 3600;

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createSessionToken(secret: string, username: string): Promise<string> {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${username}.${exp}`;
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(secret: string, token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [username, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmacSign(secret, `${username}.${expStr}`);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? username : null;
}

export function setAdminCookie(c: Context<any>, token: string): void {
  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    path: '/admin',
    maxAge: MAX_AGE,
  });
}

export function clearAdminCookie(c: Context<any>): void {
  deleteCookie(c, ADMIN_COOKIE, { path: '/admin' });
}

export async function requireAdmin(c: Context<any>): Promise<boolean> {
  const secret = c.env.SESSION_SECRET;
  const token = getCookie(c, ADMIN_COOKIE);
  if (!secret || !token) return false;
  return (await verifySessionToken(secret, token)) !== null;
}

export function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
