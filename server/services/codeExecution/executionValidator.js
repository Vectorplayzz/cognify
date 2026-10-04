/**
 * Execution Request Validator — rejects bad or oversized payloads before
 * they ever reach Piston (handout §34).
 */

export const LIMITS = {
    MAX_CODE_BYTES: Number(process.env.EXEC_MAX_CODE_BYTES || 64 * 1024),   // 64 KB
    MAX_STDIN_BYTES: Number(process.env.EXEC_MAX_STDIN_BYTES || 16 * 1024), // 16 KB
    MAX_FILES: Number(process.env.EXEC_MAX_FILES || 5),
    MAX_FILENAME: 128,
    MIN_TIMEOUT_MS: 1000,
    // Piston enforces its own ceiling (3s run / 10s compile by default) and
    // rejects anything above it, so this must not exceed the Piston config.
    MAX_TIMEOUT_MS: Number(process.env.EXEC_MAX_TIMEOUT_MS || 3000),
};

// Conservative: filenames are passed to a sandbox filesystem.
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

export class ValidationError extends Error {
    constructor(message, field) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

const bytes = (s) => Buffer.byteLength(s || '', 'utf-8');

/**
 * Validate and normalize an execution request.
 * Throws ValidationError; returns a cleaned payload on success.
 */
export function validateExecutionRequest(body) {
    if (!body || typeof body !== 'object') {
        throw new ValidationError('Request body must be a JSON object', 'body');
    }

    const { language, version, files, stdin, run_timeout: runTimeout } = body;

    if (typeof language !== 'string' || !language.trim()) {
        throw new ValidationError('A language is required', 'language');
    }
    if (language.length > 40) {
        throw new ValidationError('Language name is too long', 'language');
    }

    if (version !== undefined && version !== null) {
        if (typeof version !== 'string' || version.length > 32) {
            throw new ValidationError('Version must be a short string', 'version');
        }
        if (!/^[A-Za-z0-9.\-+]*$/.test(version)) {
            throw new ValidationError('Version contains invalid characters', 'version');
        }
    }

    if (!Array.isArray(files) || files.length === 0) {
        throw new ValidationError('At least one file is required', 'files');
    }
    if (files.length > LIMITS.MAX_FILES) {
        throw new ValidationError(`At most ${LIMITS.MAX_FILES} files may be submitted`, 'files');
    }

    let totalBytes = 0;
    const cleanFiles = files.map((file, i) => {
        if (!file || typeof file !== 'object') {
            throw new ValidationError(`File ${i} is not an object`, 'files');
        }
        const content = file.content;
        if (typeof content !== 'string') {
            throw new ValidationError(`File ${i} has no string content`, 'files');
        }
        if (content.trim() === '') {
            throw new ValidationError('Code cannot be empty', 'files');
        }
        totalBytes += bytes(content);

        const out = { content };
        if (file.name !== undefined && file.name !== null && file.name !== '') {
            if (typeof file.name !== 'string' || file.name.length > LIMITS.MAX_FILENAME) {
                throw new ValidationError(`File ${i} has an invalid name`, 'files');
            }
            if (!SAFE_FILENAME.test(file.name) || file.name.startsWith('.')) {
                throw new ValidationError(
                    `File ${i} name may only contain letters, digits, dot, dash and underscore`,
                    'files'
                );
            }
            out.name = file.name;
        }
        return out;
    });

    if (totalBytes > LIMITS.MAX_CODE_BYTES) {
        throw new ValidationError(
            `Source code exceeds the ${Math.floor(LIMITS.MAX_CODE_BYTES / 1024)} KB limit`,
            'files'
        );
    }

    let cleanStdin = '';
    if (stdin !== undefined && stdin !== null) {
        if (typeof stdin !== 'string') {
            throw new ValidationError('stdin must be a string', 'stdin');
        }
        if (bytes(stdin) > LIMITS.MAX_STDIN_BYTES) {
            throw new ValidationError(
                `stdin exceeds the ${Math.floor(LIMITS.MAX_STDIN_BYTES / 1024)} KB limit`,
                'stdin'
            );
        }
        cleanStdin = stdin;
    }

    // Clamp rather than reject — a client asking for too long simply gets the cap.
    let timeout = Number(runTimeout);
    if (!Number.isFinite(timeout)) timeout = LIMITS.MAX_TIMEOUT_MS;
    timeout = Math.min(Math.max(Math.trunc(timeout), LIMITS.MIN_TIMEOUT_MS), LIMITS.MAX_TIMEOUT_MS);

    return {
        language: language.trim().toLowerCase(),
        version: version ? version.trim() : undefined,
        files: cleanFiles,
        stdin: cleanStdin,
        runTimeout: timeout,
    };
}
