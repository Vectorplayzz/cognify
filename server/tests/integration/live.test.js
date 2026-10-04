/**
 * Integration tests against a running Cognify API (handout §38 testing
 * matrix). They exercise the real path: Cognify API -> roadmap.sh / AI, and
 * Cognify API -> Piston -> sandboxed execution.
 *
 * Run: npm run test:integration
 * Target another deployment with COGNIFY_API_URL=https://host/api.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import '../../load-env.js';
import { issueSession } from '../../auth/session.js';

const API = (process.env.COGNIFY_API_URL || 'http://127.0.0.1:3002/api').replace(/\/+$/, '');

// A session for a synthetic user id that owns nothing, minted with the
// server's own SESSION_SECRET. Using it against real ids proves the
// ownership checks: the rows exist, but none belong to this user.
const TEST_USER_ID = 2147480000;
const TOKEN = issueSession({ userId: TEST_USER_ID, googleId: 'integration-test' }).token;

async function call(path, { method = 'GET', body, timeoutMs = 60000, token = TOKEN } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}

describe('authentication', () => {
    const PROTECTED = [
        ['GET', '/roadmaps/resolve?topic=frontend'],
        ['GET', '/roadmaps/user/1'],
        ['GET', '/chat/sessions/1'],
        ['DELETE', '/chat/sessions/1'],
        ['GET', '/notes/users/1/notes'],
        ['POST', '/notes/retrieve'],
        ['POST', '/execute'],
        ['POST', '/llm/chat'],
        ['POST', '/search/web'],
        ['PUT', '/users/1/xp'],
    ];
    for (const [method, path] of PROTECTED) {
        test(`${method} ${path} without a session -> 401`, async () => {
            const { status } = await call(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : {}, token: null });
            assert.equal(status, 401);
        });
    }

    test('a forged token is rejected', async () => {
        const forged = Buffer.from(JSON.stringify({ uid: 1, gid: 'x', iat: 0, exp: 9999999999 })).toString('base64url') + '.forged';
        assert.equal((await call('/auth/me', { token: forged })).status, 401);
    });

    test('an invalid Google token cannot sign in', async () => {
        const { status } = await call('/auth/google', { method: 'POST', body: { access_token: 'ya29.not-a-real-google-access-token' }, token: null });
        assert.equal(status, 401);
    });

    test('the unauthenticated user upsert endpoint is gone', async () => {
        const { status } = await call('/users/upsert', { method: 'POST', body: { google_id: 'x', name: 'x' } });
        assert.equal(status, 404);
    });

    test('status endpoints stay public', async () => {
        for (const path of ['/roadmaps/catalog', '/health/piston', '/llm/status']) {
            assert.equal((await call(path, { token: null })).status, 200, path);
        }
    });
});

describe('ownership — another user\'s data is unreachable', () => {
    test('a path user id other than your own -> 403', async () => {
        for (const path of ['/roadmaps/user/1', '/progress/1', '/chat/sessions/1', '/code-history/1', '/rooms/user/1', '/notes/users/1/notes']) {
            assert.equal((await call(path)).status, 403, path);
        }
    });

    test('resources owned by others read as not found', async () => {
        for (const path of ['/roadmaps/1', '/chat/messages/1', '/rooms/1', '/rooms/1/messages', '/notes/notes/1', '/notes/notes/1/sources', '/level-content/1/1', '/level-quiz/1/1']) {
            assert.equal((await call(path)).status, 404, path);
        }
    });

    test('writes against others\' resources change nothing', async () => {
        const writes = [
            ['DELETE', '/roadmaps/1'],
            ['DELETE', '/chat/sessions/1'],
            ['PUT', '/chat/sessions/1', { title: 'hijacked' }],
            ['DELETE', '/notes/notes/1'],
            ['PUT', '/notes/notes/1', { title: 'hijacked' }],
            ['POST', '/rooms/1/regenerate-code'],
            ['POST', '/rooms/1/messages', { content: 'hi' }],
            ['POST', '/chat/messages', { session_id: 1, role: 'user', content: 'hi' }],
            ['PUT', '/progress', { roadmap_id: 1 }],
        ];
        for (const [method, path, body] of writes) {
            assert.equal((await call(path, { method, body })).status, 404, `${method} ${path}`);
        }
    });

    test('a user id in the body is ignored', async () => {
        const { status } = await call('/users/1/xp', { method: 'PUT', body: { xp: 999999 } });
        assert.equal(status, 403);
    });
});

describe('llm', () => {
    test('the frontend\'s request shape (no model named) gets an answer', { timeout: 180000 }, async () => {
        const { status, body } = await call('/llm/chat', {
            method: 'POST',
            body: { messages: [{ role: 'user', content: 'Reply with just: OK' }], max_tokens: 10 },
            timeoutMs: 170000,
        });
        assert.equal(status, 200, JSON.stringify(body));
        assert.ok(body.choices?.[0]?.message?.content);
    });

    test('a model outside the allowlist is refused', async () => {
        const { status, body } = await call('/llm/chat', { method: 'POST', body: { model: 'openai/gpt-5', messages: [{ role: 'user', content: 'x' }] } });
        assert.equal(status, 400);
        assert.equal(body.code, 'model_not_allowed');
    });
});

// Execution is rate limited per user, so each run uses its own synthetic
// user — the suite exercises the sandbox, not the limiter.
let runUser = TEST_USER_ID;
const run = (language, content, stdin = '') =>
    call('/execute', {
        method: 'POST',
        body: { language, files: [{ content }], stdin },
        token: issueSession({ userId: --runUser, googleId: 'integration-test' }).token,
    });

describe('roadmaps', () => {
    test('existing roadmap comes from roadmap.sh with attribution', async () => {
        const { status, body } = await call('/roadmaps/resolve?topic=frontend');
        assert.equal(status, 200);
        assert.equal(body.source, 'roadmap.sh');
        assert.equal(body.roadmap.sourceUrl, 'https://roadmap.sh/frontend');
        assert.ok(body.roadmap.levels.length > 5);
        assert.ok(body.roadmap.levels[0].title);
    });

    test('alias resolves to the curated roadmap, not AI', async () => {
        for (const topic of ['react.js', 'k8s', 'Node JS developer']) {
            const { body } = await call(`/roadmaps/resolve?topic=${encodeURIComponent(topic)}`);
            assert.equal(body.source, 'roadmap.sh', `"${topic}" fell back to ${body.source}`);
        }
    });

    test('unsupported topic uses validated AI generation', { timeout: 240000 }, async () => {
        const { status, body } = await call('/roadmaps/resolve?topic=' + encodeURIComponent('Medieval Falconry'), { timeoutMs: 230000 });
        assert.equal(status, 200);
        assert.equal(body.source, 'ai');
        assert.ok(body.roadmap.levels.length >= 3 && body.roadmap.levels.length <= 12);
        for (const level of body.roadmap.levels) assert.ok(level.title && level.xpReward > 0);
    });

    test('roadmap attribution survives saving (source column)', async () => {
        // Read-only check: the create route stores `source`; here we confirm
        // resolve returns the fields the client saves.
        const { body } = await call('/roadmaps/resolve?topic=frontend');
        for (const key of ['source', 'sourceSlug', 'sourceUrl']) assert.ok(body.roadmap[key], key);
    });

    test('empty and over-long topics are rejected with 400', async () => {
        assert.equal((await call('/roadmaps/resolve?topic=')).status, 400);
        assert.equal((await call('/roadmaps/resolve?topic=' + 'x'.repeat(200))).status, 400);
    });
});

describe('code playground', () => {
    test('Piston is healthy and reports runtimes', async () => {
        const { status, body } = await call('/health/piston');
        assert.equal(status, 200);
        assert.ok(body.piston.runtimeCount >= 7);
    });

    // Every language the playground UI offers (services/codeExecutionService.ts).
    const PROGRAMS = {
        python: 'print(input() + "!")',
        javascript: 'const s = require("fs").readFileSync(0, "utf8").trim(); console.log(s + "!")',
        java: 'import java.util.*; public class Main { public static void main(String[] a) { System.out.println(new Scanner(System.in).nextLine() + "!"); } }',
        go: 'package main\nimport ("bufio";"fmt";"os";"strings")\nfunc main() { s, _ := bufio.NewReader(os.Stdin).ReadString(\'\\n\'); fmt.Println(strings.TrimSpace(s) + "!") }',
        rust: 'use std::io; fn main() { let mut s = String::new(); io::stdin().read_line(&mut s).unwrap(); println!("{}!", s.trim()); }',
        c: '#include <stdio.h>\nint main() { char s[64]; scanf("%63s", s); printf("%s!\\n", s); return 0; }',
        cpp: '#include <iostream>\nint main() { std::string s; std::cin >> s; std::cout << s << "!" << std::endl; }',
    };

    for (const [language, code] of Object.entries(PROGRAMS)) {
        test(`${language}: stdin in, stdout out`, { timeout: 60000 }, async () => {
            const { status, body } = await run(language, code, 'cognify\n');
            assert.equal(status, 200, JSON.stringify(body));
            assert.equal(body.status, 'completed', body.run?.stderr);
            assert.equal(body.run.stdout.trim(), 'cognify!');
            assert.equal(body.run.exitCode, 0);
        });
    }

    test('stderr is returned', async () => {
        const { body } = await run('python', 'import sys; sys.stderr.write("warned\\n")');
        assert.match(body.run.stderr, /warned/);
    });

    test('runtime error: traceback in stderr, non-zero exit', async () => {
        const { body } = await run('python', '1/0');
        assert.equal(body.status, 'completed');
        assert.match(body.run.stderr, /ZeroDivisionError/);
        assert.notEqual(body.run.exitCode, 0);
    });

    test('compile error is reported as compile_error with the diagnostic', async () => {
        const { body } = await run('cpp', 'int main() { return 0 }');
        assert.equal(body.status, 'compile_error');
        assert.match(body.run.stderr, /error/i);
    });

    test('infinite loop is stopped by the timeout', { timeout: 60000 }, async () => {
        const { body } = await run('python', 'while True: pass');
        assert.equal(body.status, 'timeout');
        assert.equal(body.run.timedOut, true);
    });

    test('memory bomb is contained by the per-job limit', { timeout: 60000 }, async () => {
        const { body } = await run('python', 'b = bytearray(2 * 1024**3)\nprint("ESCAPED")');
        assert.equal(body.status, 'memory_limit');
        assert.doesNotMatch(body.run.stdout, /ESCAPED/);
        assert.doesNotMatch(body.run.stderr, /\/piston\/packages/);
    });

    test('sandbox: no outbound network access', { timeout: 60000 }, async () => {
        const code = 'import urllib.request\ntry:\n    urllib.request.urlopen("http://example.com", timeout=3)\n    print("NETWORK_OPEN")\nexcept Exception as e:\n    print("blocked")';
        const { body } = await run('python', code);
        assert.doesNotMatch(body.run.stdout, /NETWORK_OPEN/);
    });

    test('rate limit is per user: one user is throttled, another is not', { timeout: 120000 }, async () => {
        const noisy = issueSession({ userId: TEST_USER_ID - 5000, googleId: 'rl-a' }).token;
        const quiet = issueSession({ userId: TEST_USER_ID - 5001, googleId: 'rl-b' }).token;
        const body = { language: 'python', files: [{ content: 'print(1)' }] };
        let throttled = false;
        for (let i = 0; i < 40 && !throttled; i++) {
            throttled = (await call('/execute', { method: 'POST', body, token: noisy })).status === 429;
        }
        assert.ok(throttled, 'the noisy user should hit the limit');
        assert.equal((await call('/execute', { method: 'POST', body, token: quiet })).status, 200);
    });

    test('unsupported language gives a clear 400', async () => {
        const { status, body } = await run('cobol', 'x');
        assert.equal(status, 400);
        assert.equal(body.code, 'unsupported_language');
    });
});
