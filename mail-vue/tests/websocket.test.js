import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { babelParse } from 'vue/compiler-sfc';
import { readWorker, workerObject } from './worker-harness.js';

function authModule(dependencies) {
    const source = readWorker('websocket/auth.js');
    const functions = babelParse(source, { sourceType: 'module' }).program.body
        .filter(node => node.type === 'FunctionDeclaration' || node.type === 'ExportNamedDeclaration')
        .map(node => node.declaration || node).map(node => source.slice(node.start, node.end)).join('\n');
    return new Function(...Object.keys(dependencies),
        functions + '\nreturn {getWsUser, canWatchAllEmail, hasValidWsOrigin};')(...Object.values(dependencies));
}

function authFixture(payload) {
    return authModule({
        jwtUtils: { verifyToken: async () => payload },
        constant: { AUTH_GEN: 2 },
        KvConst: { AUTH_INFO: 'auth:' },
        permService: { userPermKeys: async () => [] },
        adminMode: workerObject('security/admin-mode.js', 'adminMode'),
    });
}

test('WebSocket accepts both legacy and current-generation sessions but rejects stale generations', async () => {
    const user = { userId: 10, email: 'admin@example.test' };
    const env = { admin: user.email, kv: { get: async () => ({ user, tokens: ['session'] }) } };
    for (const gen of [undefined, 2]) {
        const auth = authFixture({ userId: 10, token: 'session', ...(gen === undefined ? {} : { gen }) });
        assert.deepEqual(await auth.getWsUser(env, 'synthetic'), user);
    }
    const auth = authFixture({ userId: 10, token: 'session', gen: 1 });
    assert.equal(await auth.getWsUser(env, 'synthetic'), null);
});

test('WebSocket requires a live KV session and honors administrator-only mode', async () => {
    const auth = authFixture({ userId: 10, token: 'session' });
    const user = { userId: 10, email: 'reader@example.test' };
    const env = { admin: 'admin@example.test', kv: { get: async () => ({ user, tokens: ['session'] }) } };
    assert.equal(await auth.getWsUser(env, 'synthetic'), null);
    assert.deepEqual(await auth.getWsUser({ ...env, admin_only: false }, 'synthetic'), user);
    assert.equal(await auth.getWsUser({ ...env, kv: { get: async () => ({ user, tokens: [] }) } }, 'synthetic'), null);
    assert.equal(await auth.getWsUser({ ...env, kv: { get: async () => null } }, 'synthetic'), null);
});

test('WebSocket rejects foreign origins while allowing same-host and local preview connections', () => {
    const auth = authFixture(null);
    const request = (url, origin) => new Request(url, { headers: { Origin: origin } });
    assert.equal(auth.hasValidWsOrigin(request('https://mail.example.test/realtime', 'https://mail.example.test')), true);
    assert.equal(auth.hasValidWsOrigin(request('http://localhost:3010/realtime', 'http://127.0.0.1:3011')), true);
    assert.equal(auth.hasValidWsOrigin(request('https://mail.example.test/realtime', 'https://foreign.example.test')), false);
    assert.equal(auth.hasValidWsOrigin(request('https://mail.example.test/realtime', 'null')), false);
});

function clientFixture() {
    const timers = new Map(), sockets = [], listeners = { window: new Map(), document: new Map() };
    let nextTimer = 1;
    const timer = fn => { const id = nextTimer++; timers.set(id, fn); return id; };
    const events = target => ({
        addEventListener(name, fn) { listeners[target].set(name, fn); },
        removeEventListener(name, fn) { if (listeners[target].get(name) === fn) listeners[target].delete(name); },
    });
    class MockSocket {
        static CLOSED = 3;
        static OPEN = 1;
        constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }
        send() {}
        close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
        open() { this.readyState = 1; this.onopen?.(); }
    }
    const source = readFileSync(new URL('../src/websocket/client.js', import.meta.url), 'utf8')
        .replaceAll('export ', '').replace('import.meta.env.VITE_BASE_URL', "'/api'");
    const createWsClient = new Function('window', 'document', 'localStorage', 'WebSocket',
        source + '\nreturn createWsClient;')({
        ...events('window'), location: { origin: 'https://mail.example.test' },
        setTimeout: timer, setInterval: timer, clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    }, { ...events('document'), visibilityState: 'visible' }, { getItem: () => 'synthetic-session' }, MockSocket);
    return { client: createWsClient('inbox'), timers, sockets, listeners };
}

test('WebSocket stop removes listeners, cancels timers and detaches old socket callbacks', () => {
    const { client, timers, sockets, listeners } = clientFixture();
    let messages = 0, pulls = 0;
    const options = { isEnabled: () => true, onMessage: () => messages++, onReconnect: () => pulls++ };
    client.start(options);
    const first = sockets[0];
    first.open();
    assert.equal(timers.size, 2);
    client.stop();
    assert.equal(timers.size, 0);
    assert.equal(listeners.window.size, 0);
    assert.equal(listeners.document.size, 0);
    assert.equal(first.readyState, 3);
    for (const name of ['onopen', 'onmessage', 'onclose', 'onerror']) assert.equal(first[name], null);
    assert.equal(messages, 0);
    assert.equal(pulls, 0);
    client.start(options);
    assert.equal(sockets.length, 2);
    assert.equal(listeners.window.size, 1);
    client.stop();
});

test('an authorization rejection stops reconnect attempts', () => {
    const { client, timers, sockets } = clientFixture();
    client.start({ isEnabled: () => true });
    sockets[0].onclose({ code: 4401 });
    assert.equal(timers.size, 0);
    client.retryNow();
    assert.equal(sockets.length, 1);
    client.stop();
});
