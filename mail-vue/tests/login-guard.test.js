import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerObject } from './worker-harness.js';

class BizError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'BizError';
    }
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;

function setup() {
    const clock = { now: 1_800_000_000, ip: '203.0.113.7' };
    const store = new Map();
    const kv = {
        async get(key) {
            const item = store.get(key);
            if (!item || item.expiresAt <= clock.now) return null;
            return JSON.parse(item.value);
        },
        async put(key, value, options) {
            store.set(key, { value, expiresAt: clock.now + options.expirationTtl });
        },
        async delete(key) {
            store.delete(key);
        },
    };
    const guard = workerObject('security/login-guard.js', 'loginGuard', {
        BizError,
        reqUtils: { getIp: () => clock.ip },
        t: (key, values = {}) => key === 'loginLocked' ? `locked:${values.msg}` : `${values.count}${key === 'durationHours' ? 'h' : 'm'}`,
    });
    guard.now = () => clock.now;
    return { guard, clock, store, c: { env: { kv } } };
}

async function fail(ctx, email, times = 1) {
    let error = null;
    for (let i = 0; i < times; i++) {
        const state = await ctx.guard.check(ctx.c, email);
        error = await ctx.guard.recordFailure(ctx.c, state).then(() => null, e => e);
    }
    return error;
}

async function lockedMessage(ctx, email) {
    const error = await ctx.guard.check(ctx.c, email).then(() => null, e => e);
    return error && `${error.code}:${error.message}`;
}

test('repeated lockouts escalate from 15 minutes up to a 24 hour cap', async () => {
    const ctx = setup();
    const email = 'admin@example.test';

    assert.equal(await fail(ctx, email, 4), null);
    const first = await fail(ctx, email);
    assert.equal(first.code, 429);
    assert.equal(first.message, 'locked:15m');
    assert.equal(await lockedMessage(ctx, email), '429:locked:15m');

    const expected = ['locked:1h', 'locked:6h', 'locked:24h', 'locked:24h'];
    let previous = 15 * MINUTE;
    for (const message of expected) {
        ctx.clock.now += previous + 1;
        assert.equal(await lockedMessage(ctx, email), null);
        assert.equal(await fail(ctx, email, 4), null);
        assert.equal((await fail(ctx, email)).message, message);
        previous = { 'locked:1h': HOUR, 'locked:6h': 6 * HOUR, 'locked:24h': 24 * HOUR }[message];
    }
});

test('remaining lock time is reported while locked and other addresses stay usable', async () => {
    const ctx = setup();
    await fail(ctx, 'admin@example.test', 5);
    ctx.clock.now += 10 * MINUTE;
    assert.equal(await lockedMessage(ctx, 'ADMIN@example.test '), '429:locked:5m');
    assert.equal(await lockedMessage(ctx, 'other@example.test'), null);

    ctx.clock.ip = '198.51.100.9';
    assert.equal(await lockedMessage(ctx, 'admin@example.test'), null);
});

test('penalty level resets 24 hours after the last lock ends', async () => {
    const ctx = setup();
    const email = 'admin@example.test';
    await fail(ctx, email, 5);
    ctx.clock.now += 15 * MINUTE + 24 * HOUR + 1;
    assert.equal((await fail(ctx, email, 5)).message, 'locked:15m');
});

test('successful login clears the pair record and its penalty level', async () => {
    const ctx = setup();
    const email = 'admin@example.test';
    await fail(ctx, email, 5);
    ctx.clock.now += 15 * MINUTE + 1;

    await ctx.guard.clear(ctx.c, await ctx.guard.check(ctx.c, email));
    assert.equal(await fail(ctx, email, 4), null);
    assert.equal((await fail(ctx, email)).message, 'locked:15m');
});

test('failure count resets after the 15 minute window', async () => {
    const ctx = setup();
    const email = 'admin@example.test';
    await fail(ctx, email, 4);
    ctx.clock.now += 15 * MINUTE + 1;
    assert.equal(await fail(ctx, email, 4), null);
});

test('one IP trying many addresses is locked after 30 failures', async () => {
    const ctx = setup();
    for (let i = 0; i < 29; i++) {
        assert.equal(await fail(ctx, `user${i}@example.test`), null);
    }
    assert.equal((await fail(ctx, 'user29@example.test')).message, 'locked:15m');
    assert.equal(await lockedMessage(ctx, 'fresh@example.test'), '429:locked:15m');
});

test('legacy count-only records keep blocking until they expire', async () => {
    const ctx = setup();
    const state = await ctx.guard.check(ctx.c, 'admin@example.test');
    await ctx.c.env.kv.put(state.pairKey, JSON.stringify({ count: 5 }), { expirationTtl: 15 * MINUTE });
    assert.equal(await lockedMessage(ctx, 'admin@example.test'), '429:locked:15m');
});

test('records with a penalty level outlive the failure window', async () => {
    const ctx = setup();
    const email = 'admin@example.test';
    await fail(ctx, email, 5);
    const state = await ctx.guard.check(ctx.c, 'x@example.test');
    const pairKey = [...ctx.store.keys()].find(key => key.includes(':p:') && key !== state.pairKey);
    assert.equal(ctx.store.get(pairKey).expiresAt - ctx.clock.now, 15 * MINUTE + 24 * HOUR);
});
