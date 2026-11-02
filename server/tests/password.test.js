import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    hashPassword, verifyPassword, normalizeEmail, validatePassword, validateName,
    checkLoginThrottle, recordLoginFailure, clearLoginFailures, PasswordAuthError,
} from '../auth/password.js';

describe('password hashing', () => {
    test('round-trips and rejects wrong passwords', async () => {
        const h = await hashPassword('correct horse battery');
        assert.match(h, /^scrypt\$16384\$8\$1\$/);
        assert.equal(await verifyPassword('correct horse battery', h), true);
        assert.equal(await verifyPassword('correct horse batterz', h), false);
    });
    test('salts every hash', async () => {
        assert.notEqual(await hashPassword('same-password'), await hashPassword('same-password'));
    });
    test('treats malformed stored hashes as a mismatch', async () => {
        assert.equal(await verifyPassword('x', ''), false);
        assert.equal(await verifyPassword('x', 'bcrypt$whatever'), false);
        assert.equal(await verifyPassword('x', null), false);
    });
});

describe('validation', () => {
    test('normalizes emails', () => {
        assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
        assert.throws(() => normalizeEmail('not-an-email'), PasswordAuthError);
        assert.throws(() => normalizeEmail(''), PasswordAuthError);
    });
    test('enforces password length', () => {
        assert.throws(() => validatePassword('short'), /at least 8/);
        assert.throws(() => validatePassword('        '), /spaces/);
        assert.throws(() => validatePassword('x'.repeat(201)), /at most/);
        assert.equal(validatePassword('longenough'), 'longenough');
    });
    test('cleans names', () => {
        assert.equal(validateName('  Ada   Lovelace '), 'Ada Lovelace');
        assert.throws(() => validateName('   '), PasswordAuthError);
    });
});

describe('login throttle', () => {
    test('locks an email after repeated failures and clears on success', () => {
        const email = `t${Date.now()}@example.com`;
        for (let i = 0; i < 8; i++) recordLoginFailure(email);
        assert.throws(() => checkLoginThrottle(email), (e) => e.status === 429);
        clearLoginFailures(email);
        assert.doesNotThrow(() => checkLoginThrottle(email));
    });
});
