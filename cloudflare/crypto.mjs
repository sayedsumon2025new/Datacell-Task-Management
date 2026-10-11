import bcrypt from './vendor/bcrypt.mjs';

const encode = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const bytes = value => Uint8Array.from(value.match(/../g) || [], x => parseInt(x, 16));
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async value => hex(await crypto.subtle.digest('SHA-256', encode.encode(value)));
export async function hashPassword(password) {
  if (typeof password !== 'string' || !password || password.length > 1000) throw new Error('Password required (max 1000 characters)');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encode.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return 'pbkdf2$100000$' + hex(salt) + '$' + hex(hash);
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || !password || password.length > 1000 || !encoded) return false;
  // Existing Work Hour bcrypt credentials are verified once and upgraded on login.
  if (/^\$2[aby]\$/.test(encoded)) return bcrypt.compare(password, encoded);
  const [algorithm, rounds, salt, expected] = encoded.split('$');
  if (algorithm !== 'pbkdf2' || rounds !== '100000' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const key = await crypto.subtle.importKey('raw', encode.encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations: Number(rounds) }, key, 256));
  const target = bytes(expected); let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ target[i];
  return difference === 0;
}
export async function cacheSecret(secret, profile) {
  const key = await crypto.subtle.importKey('raw', encode.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encode.encode(JSON.stringify(profile))));
}
