/**
 * Code Execution Service — the entry point the routes use.
 *
 * validate → resolve runtime → run on Piston → normalize → log
 */
import crypto from 'crypto';
import { executeOnPiston, PistonUnavailableError, PistonRequestError, PISTON_URL } from './pistonClient.js';
import { resolveRuntime, getRuntimes, invalidateRuntimeCache, listSupportedLanguages } from './runtimeResolver.js';
import { validateExecutionRequest, ValidationError, LIMITS } from './executionValidator.js';
import { formatExecutionResult } from './executionFormatter.js';

// Piston refuses a compile_timeout above its own configured ceiling (10s by
// default), so this is capped independently of the run timeout.
const COMPILE_TIMEOUT_MS = Number(process.env.PISTON_COMPILE_TIMEOUT_MS || 10000);

/** Structured execution logging. Source code is never logged. */
function logEvent(event, fields = {}) {
    const entry = { event, ts: new Date().toISOString(), ...fields };
    console.log(`\x1b[2m${entry.ts}\x1b[0m \x1b[36m[exec]\x1b[0m ${JSON.stringify(entry)}`);
}

export class ExecutionError extends Error {
    constructor(message, { status = 500, code = 'execution_failed', field } = {}) {
        super(message);
        this.name = 'ExecutionError';
        this.status = status;
        this.code = code;
        this.field = field;
    }
}

/**
 * Run a user's code. `body` is the raw request body.
 * Throws ExecutionError with an appropriate HTTP status on failure.
 */
export async function execute(body) {
    const executionId = `exec_${crypto.randomBytes(6).toString('hex')}`;
    const started = Date.now();

    // ── validate ──
    let req;
    try {
        req = validateExecutionRequest(body);
    } catch (err) {
        if (err instanceof ValidationError) {
            logEvent('execution.rejected', { executionId, reason: err.message, field: err.field });
            throw new ExecutionError(err.message, { status: 400, code: 'invalid_request', field: err.field });
        }
        throw err;
    }

    logEvent('execution.requested', {
        executionId,
        language: req.language,
        version: req.version || 'latest',
        codeBytes: req.files.reduce((n, f) => n + Buffer.byteLength(f.content, 'utf-8'), 0),
    });

    // ── resolve runtime ──
    let runtime;
    try {
        runtime = await resolveRuntime(req.language, req.version);
    } catch (err) {
        logEvent('execution.failed', { executionId, stage: 'runtime_resolution', error: err.message });
        throw new ExecutionError(
            'The code execution service is currently unavailable. Please try again shortly.',
            { status: 503, code: 'piston_unavailable' }
        );
    }

    if (!runtime) {
        const supported = (await listSupportedLanguages().catch(() => []))
            .map((r) => r.language)
            .join(', ');
        logEvent('execution.rejected', { executionId, reason: 'unsupported_language', language: req.language });
        throw new ExecutionError(
            `Language "${req.language}" is not available.${supported ? ` Supported: ${supported}.` : ''}`,
            { status: 400, code: 'unsupported_language', field: 'language' }
        );
    }

    if (runtime._versionMismatch) {
        logEvent('execution.rejected', {
            executionId,
            reason: 'unsupported_version',
            language: req.language,
            requested: runtime._requestedVersion,
            installed: runtime.version,
        });
        throw new ExecutionError(
            `Version ${runtime._requestedVersion} of ${runtime.language} is not installed (available: ${runtime.version}).`,
            { status: 400, code: 'unsupported_version', field: 'version' }
        );
    }

    logEvent('execution.runtime_resolved', {
        executionId,
        language: runtime.language,
        version: runtime.version,
    });

    // ── execute ──
    const payload = {
        language: runtime.language,
        version: runtime.version,
        files: req.files,
        stdin: req.stdin,
        run_timeout: req.runTimeout,
        compile_timeout: COMPILE_TIMEOUT_MS,
    };

    let pistonResponse;
    try {
        logEvent('execution.piston_request', { executionId, target: PISTON_URL });
        pistonResponse = await executeOnPiston(payload);
    } catch (err) {
        const durationMs = Date.now() - started;
        if (err instanceof PistonRequestError) {
            logEvent('execution.failed', { executionId, stage: 'piston_request', error: err.message, durationMs });
            throw new ExecutionError(err.message, { status: 400, code: 'piston_rejected' });
        }
        if (err instanceof PistonUnavailableError) {
            // A restarted Piston may have a different runtime set.
            invalidateRuntimeCache();
            logEvent('execution.failed', { executionId, stage: 'piston_unreachable', error: err.message, durationMs });
            throw new ExecutionError(
                'The code execution service is currently unavailable. Please try again shortly.',
                { status: 503, code: 'piston_unavailable' }
            );
        }
        logEvent('execution.failed', { executionId, stage: 'unknown', error: err.message, durationMs });
        throw new ExecutionError('Execution failed unexpectedly.', { status: 500 });
    }

    const durationMs = Date.now() - started;
    const result = formatExecutionResult({ pistonResponse, runtime, executionId, durationMs });

    logEvent('execution.completed', {
        executionId,
        language: result.language,
        status: result.status,
        exitCode: result.run.exitCode,
        durationMs,
    });

    return result;
}

/** Piston health, for the diagnostic endpoint. */
export async function checkPistonHealth() {
    try {
        const runtimes = await getRuntimes({ force: true });
        return {
            healthy: true,
            piston: { reachable: true, runtimeCount: runtimes.length, url: PISTON_URL },
        };
    } catch (err) {
        return {
            healthy: false,
            piston: { reachable: false, error: err.message, url: PISTON_URL },
        };
    }
}

export { listSupportedLanguages, LIMITS };
