/**
 * requireAuth — every data and AI route sits behind this.
 *
 * Identity comes only from the verified session token. Routes must use
 * req.user.id and never trust a user id sent in the body, query or path.
 */
import { verifySession, SessionError } from '../auth/session.js';

export function requireAuth(req, res, next) {
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) {
        return res.status(401).json({ error: 'Sign in required', code: 'auth_required' });
    }
    try {
        const session = verifySession(match[1]);
        req.user = { id: session.userId, googleId: session.googleId };
        return next();
    } catch (err) {
        if (err instanceof SessionError) {
            return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: err.code });
        }
        return next(err);
    }
}

/**
 * For legacy routes that still carry a user id in the path: allow only the
 * caller's own id. Responds 403 and returns false on mismatch.
 */
export function assertSelf(req, res, userId) {
    if (String(userId) !== String(req.user.id)) {
        res.status(403).json({ error: 'You do not have access to this resource', code: 'forbidden' });
        return false;
    }
    return true;
}
