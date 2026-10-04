/**
 * In-memory fixed-window rate limiter.
 *
 * Cognify runs a single API process (pm2 fork mode), so per-process counters
 * are accurate. If this ever scales to multiple instances, move the counters
 * into the Redis instance already running on the box.
 */

export function rateLimit({ windowMs = 60000, max = 30, keyPrefix = 'rl' } = {}) {
    const hits = new Map(); // key -> { count, resetAt }

    // Drop expired buckets so the map cannot grow without bound.
    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of hits) {
            if (bucket.resetAt <= now) hits.delete(key);
        }
    }, windowMs);
    if (typeof sweep.unref === 'function') sweep.unref();

    return function rateLimitMiddleware(req, res, next) {
        // Signed-in requests are limited per user: a classroom behind one
        // school NAT shares an IP, and per-IP limits would throttle every
        // student together. Unauthenticated routes (sign-in) fall back to IP.
        const who = req.user?.id != null
            ? `user:${req.user.id}`
            : `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
        const key = `${keyPrefix}:${who}`;
        const now = Date.now();

        let bucket = hits.get(key);
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + windowMs };
            hits.set(key, bucket);
        }

        bucket.count += 1;

        const remaining = Math.max(0, max - bucket.count);
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

        if (bucket.count > max) {
            const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
            res.setHeader('Retry-After', String(retryAfter));
            return res.status(429).json({
                error: 'Too many requests. Please wait before trying again.',
                code: 'rate_limited',
                retryAfter,
            });
        }

        next();
    };
}
