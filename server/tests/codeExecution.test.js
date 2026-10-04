/**
 * Code Playground unit tests (handout §34, §38) — Piston is stubbed via
 * global fetch, so these run without Docker.
 * Run: npm test
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { validateExecutionRequest, ValidationError, LIMITS } from '../services/codeExecution/executionValidator.js';
import { formatExecutionResult } from '../services/codeExecution/executionFormatter.js';
import { invalidateRuntimeCache } from '../services/codeExecution/runtimeResolver.js';
import { execute, ExecutionError, checkPistonHealth } from '../services/codeExecution/index.js';

const py = (content = 'print(1)', extra = {}) => ({ language: 'python', files: [{ content }], ...extra });

describe('request validation', () => {
    const rejects = (body, field) =>
        assert.throws(() => validateExecutionRequest(body), (err) => err instanceof ValidationError && err.field === field);

    test('accepts a minimal request and normalizes it', () => {
        const out = validateExecutionRequest({ language: ' Python ', files: [{ content: 'print(1)' }] });
        assert.equal(out.language, 'python');
        assert.equal(out.stdin, '');
        assert.equal(out.runTimeout, LIMITS.MAX_TIMEOUT_MS);
    });

    test('rejects a missing body', () => rejects(null, 'body'));
    test('rejects a missing language', () => rejects({ files: [{ content: 'x' }] }, 'language'));
    test('rejects no files', () => rejects({ language: 'python', files: [] }, 'files'));
    test('rejects empty code', () => rejects(py('   '), 'files'));
    test('rejects too many files', () =>
        rejects({ language: 'python', files: Array.from({ length: LIMITS.MAX_FILES + 1 }, () => ({ content: 'x' })) }, 'files'));
    test('rejects oversized code', () => rejects(py('x'.repeat(LIMITS.MAX_CODE_BYTES + 1)), 'files'));
    test('rejects oversized stdin', () => rejects(py('x', { stdin: 'y'.repeat(LIMITS.MAX_STDIN_BYTES + 1) }), 'stdin'));
    test('rejects path traversal in a filename', () =>
        rejects({ language: 'python', files: [{ name: '../../etc/passwd', content: 'x' }] }, 'files'));
    test('rejects a hidden filename', () => rejects({ language: 'python', files: [{ name: '.bashrc', content: 'x' }] }, 'files'));
    test('rejects a malformed version', () => rejects(py('x', { version: '3; rm -rf /' }), 'version'));

    test('clamps the run timeout rather than trusting the client', () => {
        assert.equal(validateExecutionRequest(py('x', { run_timeout: 999999 })).runTimeout, LIMITS.MAX_TIMEOUT_MS);
        assert.equal(validateExecutionRequest(py('x', { run_timeout: 1 })).runTimeout, LIMITS.MIN_TIMEOUT_MS);
    });
});

describe('result formatting', () => {
    const fmt = (pistonResponse) => formatExecutionResult({ pistonResponse, runtime: {}, executionId: 'e', durationMs: 5 });

    test('stdout from a successful run', () => {
        const r = fmt({ language: 'python', version: '3.12', run: { stdout: 'hi\n', stderr: '', code: 0 } });
        assert.equal(r.status, 'completed');
        assert.equal(r.run.stdout, 'hi\n');
        assert.equal(r.run.exitCode, 0);
    });

    test('stderr and non-zero exit from a runtime error', () => {
        const r = fmt({ run: { stdout: '', stderr: 'ZeroDivisionError', code: 1 } });
        assert.equal(r.status, 'completed'); // user code failing is a valid result
        assert.equal(r.run.stderr, 'ZeroDivisionError');
        assert.equal(r.run.exitCode, 1);
    });

    test('compile errors are surfaced in stderr', () => {
        const r = fmt({ compile: { stdout: '', stderr: "error: expected ';'", code: 1 }, run: { stdout: '', stderr: '', code: null } });
        assert.equal(r.status, 'compile_error');
        assert.match(r.run.stderr, /expected ';'/);
    });

    test('a memory-limit kill is named plainly and hides the sandbox path', () => {
        const r = fmt({ run: { stdout: '', code: 137, signal: null, status: 'RE',
            stderr: '/piston/packages/python/3.12.0/run: line 3:     3 Killed                  python3.12 "$@"\n' } });
        assert.equal(r.status, 'memory_limit');
        assert.match(r.run.stderr, /Memory limit exceeded/);
        assert.doesNotMatch(r.run.stderr, /\/piston\/packages/);
        assert.equal(r.run.exitCode, 137);
    });

    test('exit 137 from the user program itself is not mislabelled as memory', () => {
        const r = fmt({ run: { stdout: '', stderr: 'bye', code: 137, signal: null } });
        assert.equal(r.status, 'completed');
        assert.equal(r.run.stderr, 'bye');
    });

    test('a timeout is reported as such, with a message', () => {
        const r = fmt({ run: { stdout: '', stderr: '', code: null, signal: 'SIGKILL', status: 'TO', message: 'Time limit exceeded' } });
        assert.equal(r.status, 'timeout');
        assert.equal(r.run.timedOut, true);
        assert.match(r.run.stderr, /Time limit exceeded/);
    });
});

describe('execute() against a stubbed Piston', () => {
    const RUNTIMES = [{ language: 'python', version: '3.12.0', aliases: ['py', 'python3'] }];
    const realFetch = globalThis.fetch;
    const realLog = console.log;
    let calls;

    const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    function stubPiston(onExecute) {
        globalThis.fetch = async (url, options = {}) => {
            calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
            if (String(url).endsWith('/api/v2/runtimes')) return respond(200, RUNTIMES);
            return onExecute(options);
        };
    }

    beforeEach(() => {
        calls = [];
        invalidateRuntimeCache();
        console.log = () => {}; // execution logs are noisy; asserted separately below
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        console.log = realLog;
    });

    test('runs code and resolves the language alias to the installed runtime', async () => {
        stubPiston(() => respond(200, { language: 'python', version: '3.12.0', run: { stdout: '42\n', stderr: '', code: 0 } }));
        const result = await execute({ language: 'py', files: [{ content: 'print(42)' }] });
        assert.equal(result.status, 'completed');
        assert.equal(result.run.stdout, '42\n');
        const sent = calls.find((c) => c.url.endsWith('/execute')).body;
        assert.equal(sent.language, 'python');
        assert.equal(sent.version, '3.12.0');
    });

    test('an unsupported language is a 400 that lists what is supported', async () => {
        stubPiston(() => assert.fail('must not execute'));
        await assert.rejects(execute({ language: 'cobol', files: [{ content: 'x' }] }), (err) =>
            err instanceof ExecutionError && err.status === 400 && err.code === 'unsupported_language' && /python/.test(err.message));
    });

    test('an uninstalled version is rejected instead of silently running another', async () => {
        stubPiston(() => assert.fail('must not execute'));
        await assert.rejects(execute(py('x', { version: '2.7' })), (err) => err.code === 'unsupported_version' && /3\.12\.0/.test(err.message));
    });

    test('Piston unreachable -> 503 piston_unavailable', async () => {
        globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
        await assert.rejects(execute(py()), (err) => err instanceof ExecutionError && err.status === 503 && err.code === 'piston_unavailable');
    });

    test('Piston 5xx during execution -> 503 piston_unavailable', async () => {
        stubPiston(() => respond(500, { message: 'internal' }));
        await assert.rejects(execute(py()), (err) => err.status === 503 && err.code === 'piston_unavailable');
    });

    test('Piston 4xx -> 400 piston_rejected with its message', async () => {
        stubPiston(() => respond(400, { message: 'compile_timeout cannot exceed the configured limit of 10000' }));
        await assert.rejects(execute(py()), (err) => err.status === 400 && err.code === 'piston_rejected' && /compile_timeout/.test(err.message));
    });

    test('invalid requests never reach Piston', async () => {
        stubPiston(() => assert.fail('must not execute'));
        await assert.rejects(execute({ language: 'python', files: [] }), (err) => err.status === 400 && err.code === 'invalid_request');
        assert.equal(calls.length, 0);
    });

    test('logs carry diagnostics but never the source code', async () => {
        const lines = [];
        console.log = (line) => lines.push(String(line));
        stubPiston(() => respond(200, { run: { stdout: '', stderr: '', code: 0 } }));
        await execute(py('SECRET_SOURCE_MARKER = 1'));
        const joined = lines.join('\n');
        for (const event of ['execution.requested', 'execution.runtime_resolved', 'execution.completed']) {
            assert.match(joined, new RegExp(event));
        }
        assert.doesNotMatch(joined, /SECRET_SOURCE_MARKER/);
    });

    test('health check reports reachability and runtime count', async () => {
        stubPiston(() => assert.fail('unused'));
        assert.deepEqual((await checkPistonHealth()).piston.runtimeCount, 1);
        globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
        assert.equal((await checkPistonHealth()).healthy, false);
    });
});
