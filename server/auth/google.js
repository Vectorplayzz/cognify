/**
 * Google sign-in verification.
 *
 * The browser signs in with Google's implicit flow and holds an access token.
 * Before trusting it we confirm with Google that the token is live and was
 * issued to *this* app: an access token minted for some other app must not
 * be replayable here.
 */

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const TIMEOUT_MS = 10000;

export class GoogleAuthError extends Error {
    constructor(message, status = 401, code = 'google_auth_failed') {
        super(message);
        this.name = 'GoogleAuthError';
        this.status = status;
        this.code = code;
    }
}

function clientIds() {
    return (process.env.GOOGLE_CLIENT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
}

async function getJson(url, headers) {
    let res;
    try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
        throw new GoogleAuthError('Could not reach Google to verify sign-in', 503, 'google_unavailable');
    }
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
}

/**
 * Verify a Google OAuth access token.
 * Returns { googleId, email, name, picture }.
 */
export async function verifyGoogleAccessToken(accessToken) {
    if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4096) {
        throw new GoogleAuthError('A Google access token is required', 400, 'invalid_request');
    }
    const allowed = clientIds();
    if (allowed.length === 0) {
        throw new GoogleAuthError('Google sign-in is not configured on the server', 503, 'auth_not_configured');
    }

    const info = await getJson(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
    if (!info.ok || !info.body) {
        throw new GoogleAuthError('Google sign-in is invalid or has expired', 401, 'google_token_invalid');
    }
    const audience = info.body.aud || info.body.azp;
    if (!allowed.includes(audience)) {
        throw new GoogleAuthError('This Google token was not issued for Cognify', 401, 'google_token_wrong_audience');
    }
    if (Number(info.body.expires_in) <= 0) {
        throw new GoogleAuthError('Google sign-in has expired', 401, 'google_token_invalid');
    }

    const profile = await getJson(USERINFO_URL, { Authorization: `Bearer ${accessToken}` });
    if (!profile.ok || !profile.body?.sub) {
        throw new GoogleAuthError('Could not read the Google profile', 401, 'google_token_invalid');
    }
    // tokeninfo and userinfo must describe the same account.
    if (info.body.sub && info.body.sub !== profile.body.sub) {
        throw new GoogleAuthError('Google token and profile do not match', 401, 'google_token_invalid');
    }

    return {
        googleId: String(profile.body.sub),
        email: profile.body.email || null,
        name: profile.body.name || profile.body.email || 'User',
        picture: profile.body.picture || null,
    };
}
