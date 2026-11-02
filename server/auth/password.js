/**
 * Email + password accounts.
 *
 * Passwords are hashed with scrypt (Node's built-in, memory-hard KDF) and a
 * random 16-byte salt. Stored format:
 *   scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
 * so cost parameters can be raised later without breaking old hashes.
 */
import crypto from 'crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export class PasswordAuthError extends Error {
    constructor(message, status = 400, code = 'invalid_request') {
        super(message);
        this.name = 'PasswordAuthError';
        this.status = status;
        this.code = code;
    }
}

function scrypt(password, salt, n = N, r = R, p = P) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
    });
}

export async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(String(password).normalize('NFKC'), salt);
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    let key;
    try {
        key = await scrypt(String(password).normalize('NFKC'), Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
    } catch {
        return false;
    }
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// A fixed hash to verify against when the email is unknown, so a failed
// login takes the same time whether or not the account exists.
let dummyHash = null;
export async function burnTime(password) {
    if (!dummyHash) dummyHash = await hashPassword('cognify-dummy-password');
    await verifyPassword(password, dummyHash);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email) {
    const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!e || e.length > 254 || !EMAIL_RE.test(e)) {
        throw new PasswordAuthError('Enter a valid email address.', 400, 'invalid_email');
    }
    return e;
}

export function validatePassword(password) {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
        throw new PasswordAuthError(`Use at least ${PASSWORD_MIN} characters for your password.`, 400, 'weak_password');
    }
    if (password.length > PASSWORD_MAX) {
        throw new PasswordAuthError(`Passwords can be at most ${PASSWORD_MAX} characters.`, 400, 'weak_password');
    }
    if (!password.trim()) {
        throw new PasswordAuthError('Your password can’t be only spaces.', 400, 'weak_password');
    }
    return password;
}

export function validateName(name) {
    const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
    if (!n) throw new PasswordAuthError('Tell us your name.', 400, 'invalid_name');
    if (n.length > 80) throw new PasswordAuthError('That name is too long (80 characters max).', 400, 'invalid_name');
    return n;
}

/**
 * Per-email failed-login throttle (in memory; one API process). Combined
 * with the per-IP auth limiter, this stops password guessing against a
 * single account from many addresses.
 */
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 8;
const failures = new Map(); // email -> { count, resetAt }

export function checkLoginThrottle(email) {
    const f = failures.get(email);
    if (f && f.resetAt > Date.now() && f.count >= FAIL_MAX) {
        const mins = Math.ceil((f.resetAt - Date.now()) / 60000);
        throw new PasswordAuthError(`Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 429, 'too_many_attempts');
    }
}
export function recordLoginFailure(email) {
    const now = Date.now();
    const f = failures.get(email);
    if (!f || f.resetAt <= now) failures.set(email, { count: 1, resetAt: now + FAIL_WINDOW_MS });
    else f.count += 1;
    if (failures.size > 10000) {
        for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
    }
}
export function clearLoginFailures(email) {
    failures.delete(email);
}
