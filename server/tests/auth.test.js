/**
 * Session tokens and the requireAuth middleware. No network or database.
 * Run: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
const { issueSession, verifySession, SessionError, TTL_SECONDS } = await import('../auth/session.js');
const { requireAuth, assertSelf } = await import('../middleware/auth.js');

describe('session tokens', () => {
    test('round-trips the user', () => {
        const { token } = issueSession({ userId: 42, googleId: 'g-42' });
        assert.deepEqual(
            { ...verifySession(token), expiresAt: undefined },
            { userId: 42, googleId: 'g-42', expiresAt: undefined }
        );
    });

    test('rejects a token whose payload was edited', () => {
        const { token } = issueSession({ userId: 42, googleId: 'g-42' });
        const [, sig] = token.split('.');
        const forged = Buffer.from(JSON.stringify({ uid: 1, gid: 'g-1', iat: 0, exp: 9999999999 })).toString('base64url');
        assert.throws(() => verifySession(`${forged}.${sig}`), SessionError);
    });

    test('rejects a token signed with another secret', () => {
        const { token } = issueSession({ userId: 42, googleId: 'g-42' });
        process.env.SESSION_SECRET = 'a-completely-different-secret-of-sufficient-length';
        try {
            assert.throws(() => verifySession(token), /Invalid session/);
        } finally {
            process.env.SESSION_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
        }
    });

    test('rejects an expired token', () => {
        const issuedLongAgo = Date.now() - (TTL_SECONDS + 60) * 1000;
        const { token } = issueSession({ userId: 42, googleId: 'g-42' }, { now: issuedLongAgo });
        assert.throws(() => verifySession(token), (err) => err.code === 'session_expired');
    });

    for (const bad of ['', 'abc', 'a.b.c', '.', 'x'.repeat(3000), null, 42]) {
        test(`rejects malformed input ${JSON.stringify(bad)?.slice(0, 20)}`, () => {
            assert.throws(() => verifySession(bad), SessionError);
        });
    }

    test('refuses to sign with a short secret', () => {
        process.env.SESSION_SECRET = 'short';
        try {
            assert.throws(() => issueSession({ userId: 1, googleId: 'g' }), /at least 32/);
        } finally {
            process.env.SESSION_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
        }
    });
});

describe('requireAuth middleware', () => {
    function run(headers) {
        const req = { get: (name) => headers[name.toLowerCase()] };
        const res = {
            statusCode: 200, body: null,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
        };
        let nextCalled = false;
        requireAuth(req, res, () => { nextCalled = true; });
        return { req, res, nextCalled };
    }

    test('no header -> 401 auth_required', () => {
        const { res, nextCalled } = run({});
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.code, 'auth_required');
    });

    test('bad token -> 401', () => {
        const { res, nextCalled } = run({ authorization: 'Bearer nope.nope' });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 401);
    });

    test('valid token -> req.user from the token', () => {
        const { token } = issueSession({ userId: 7, googleId: 'g-7' });
        const { req, nextCalled } = run({ authorization: `Bearer ${token}` });
        assert.equal(nextCalled, true);
        assert.deepEqual(req.user, { id: 7, googleId: 'g-7' });
    });

    test('assertSelf allows only the caller', () => {
        const res = { status(c) { this.code = c; return this; }, json() { return this; } };
        assert.equal(assertSelf({ user: { id: 7 } }, res, '7'), true);
        assert.equal(assertSelf({ user: { id: 7 } }, res, '8'), false);
        assert.equal(res.code, 403);
    });
});
