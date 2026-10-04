/**
 * Session tokens — Cognify's own credential, issued after Google sign-in.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature).
 * Stateless: the signature proves Cognify issued it, so no session table is
 * needed. Rotating SESSION_SECRET invalidates every outstanding session.
 */
import crypto from 'crypto';

const TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 7 * 24 * 60 * 60); // 7 days

export class SessionError extends Error {
    constructor(message, code = 'invalid_session') {
        super(message);
        this.name = 'SessionError';
        this.code = code;
    }
}

function secret() {
    const value = process.env.SESSION_SECRET;
    // Refuse to run with a missing or guessable secret rather than silently
    // issuing forgeable tokens.
    if (!value || value.length < 32) {
        throw new Error('SESSION_SECRET must be set to at least 32 characters');
    }
    return value;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(data) {
    return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

/** Issue a token for a Cognify user. */
export function issueSession({ userId, googleId }, { now = Date.now() } = {}) {
    const iat = Math.floor(now / 1000);
    const payload = b64url(JSON.stringify({ uid: userId, gid: googleId, iat, exp: iat + TTL_SECONDS }));
    return { token: `${payload}.${sign(payload)}`, expiresAt: new Date((iat + TTL_SECONDS) * 1000).toISOString() };
}

/** Verify a token. Returns { userId, googleId, expiresAt } or throws SessionError. */
export function verifySession(token, { now = Date.now() } = {}) {
    if (typeof token !== 'string' || token.length > 2048) throw new SessionError('Malformed session token');
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new SessionError('Malformed session token');

    const [payload, signature] = parts;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
        throw new SessionError('Invalid session token');
    }

    let claims;
    try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    } catch {
        throw new SessionError('Malformed session token');
    }
    if (!Number.isInteger(claims.uid) || claims.uid <= 0 || typeof claims.gid !== 'string') {
        throw new SessionError('Malformed session token');
    }
    if (!Number.isInteger(claims.exp) || claims.exp * 1000 <= now) {
        throw new SessionError('Session expired', 'session_expired');
    }
    return { userId: claims.uid, googleId: claims.gid, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

export { TTL_SECONDS };
