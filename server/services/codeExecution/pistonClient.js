/**
 * Piston Client — the ONLY place that talks to the Piston API.
 *
 * Piston runs on the VPS (docker container `piston_api`). Every execution
 * request funnels through here so authorization, limits and logging stay
 * under Cognify's control.
 */

const PISTON_URL = (process.env.PISTON_URL || 'http://localhost:2000').replace(/\/+$/, '');
const PISTON_TIMEOUT_MS = Number(process.env.PISTON_TIMEOUT_MS || 45000);

/** Raised when Piston itself is unreachable or misbehaving (as opposed to
 *  the user's code failing, which is a normal successful response). */
export class PistonUnavailableError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'PistonUnavailableError';
        this.cause = cause;
    }
}

/** Raised when Piston rejects the request (unknown runtime, bad payload). */
export class PistonRequestError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'PistonRequestError';
        this.status = status;
    }
}

async function pistonFetch(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PISTON_TIMEOUT_MS);
    try {
        return await fetch(`${PISTON_URL}${path}`, { ...options, signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new PistonUnavailableError(`Piston did not respond within ${PISTON_TIMEOUT_MS}ms`, err);
        }
        throw new PistonUnavailableError(`Cannot reach Piston at ${PISTON_URL}: ${err.message}`, err);
    } finally {
        clearTimeout(timer);
    }
}

/** GET /api/v2/runtimes — the list of installed language runtimes. */
export async function fetchRuntimes() {
    const res = await pistonFetch('/api/v2/runtimes');
    if (!res.ok) {
        throw new PistonUnavailableError(`Piston /runtimes returned HTTP ${res.status}`);
    }
    return res.json();
}

/**
 * POST /api/v2/execute — run code. Returns Piston's raw response.
 * A non-zero exit code is a valid result, not an error.
 */
export async function executeOnPiston(payload) {
    const res = await pistonFetch('/api/v2/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (res.status >= 400 && res.status < 500) {
        let detail = '';
        try {
            const body = await res.json();
            detail = body?.message || JSON.stringify(body);
        } catch (_) { /* non-JSON body */ }
        throw new PistonRequestError(detail || `Piston rejected the request (HTTP ${res.status})`, res.status);
    }

    if (!res.ok) {
        throw new PistonUnavailableError(`Piston returned HTTP ${res.status}`);
    }

    return res.json();
}

export { PISTON_URL };
