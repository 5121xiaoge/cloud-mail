import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { babelParse } from 'vue/compiler-sfc';
import { readWorker } from './worker-harness.js';

const require = createRequire(new URL('../../mail-worker/package.json', import.meta.url));
const { parseHTML } = require('linkedom');

function proxyFixture(fetchImage = async () => new Response('image', { headers: { 'Content-Type': 'image/png' } })) {
    const source = readWorker('service/proxy-service.js');
    const declarations = babelParse(source, { sourceType: 'module' }).program.body
        .filter(node => !['ImportDeclaration', 'ExportDefaultDeclaration'].includes(node.type))
        .map(node => source.slice(node.start, node.end)).join('\n');
    return new Function('parseHTML', 'settingService', 'fetch',
        declarations + '\nreturn proxyService;')(parseHTML,
        { query: async () => ({ r2Domain: 'assets.example.test' }) }, fetchImage);
}

test('image proxy rewrites external images and restores original URLs before forwarding', async () => {
    const service = proxyFixture();
    const c = { env: { jwt_secret: crypto.randomUUID() } };
    const html = '<img src="https://remote.example.test/logo.png"><img src="/attachments/a.png"><img src="cid:a"><img src="https://assets.example.test/a.png">';
    const rewritten = await service.rewriteHtml(c, html);
    const { document } = parseHTML(rewritten);
    const images = [...document.querySelectorAll('img')];
    assert.match(images[0].getAttribute('src'), /^\/proxy\?/);
    assert.equal(images[1].getAttribute('src'), '/attachments/a.png');
    assert.equal(images[2].getAttribute('src'), 'cid:a');
    assert.equal(images[3].getAttribute('src'), 'https://assets.example.test/a.png');
    const restored = parseHTML(service.restoreHtml(rewritten)).document;
    assert.equal(restored.querySelector('img').getAttribute('src'), 'https://remote.example.test/logo.png');
});

test('image proxy rejects tampered URLs, expired signatures and unsigned requests without fetching', async () => {
    let fetched = 0;
    const service = proxyFixture(async () => { fetched++; return new Response('image', { headers: { 'Content-Type': 'image/png' } }); });
    const env = { jwt_secret: crypto.randomUUID() };
    const key = await service.signingKey(env);
    const path = await service.toProxyPath('https://remote.example.test/a.png', String(Math.floor(Date.now() / 1000) + 60), key);
    const valid = new URL(path, 'https://mail.example.test').searchParams;
    assert.equal((await service.fetchImage(env, valid)).status, 200);
    assert.equal(fetched, 1);
    const changed = new URLSearchParams(valid);
    changed.set('url', 'https://other.example.test/a.png');
    assert.equal((await service.fetchImage(env, changed)).status, 403);
    changed.set('exp', '1');
    assert.equal((await service.fetchImage(env, changed)).status, 403);
    assert.equal((await service.fetchImage(env, new URLSearchParams({ url: 'https://remote.example.test/a.png' }))).status, 403);
    assert.equal(fetched, 1);
});

test('image proxy rejects local targets and non-image responses', async () => {
    const service = proxyFixture(async () => new Response('<script>bad</script>', { headers: { 'Content-Type': 'text/html' } }));
    for (const url of ['http://localhost/a.png', 'http://127.0.0.1/a.png', 'http://[::1]/a.png', 'https://host.internal/a.png', 'file:///a.png']) {
        assert.equal(service.proxyTarget(url), null, url);
    }
    const env = { jwt_secret: crypto.randomUUID() };
    const path = await service.toProxyPath('https://remote.example.test/a.png', String(Math.floor(Date.now() / 1000) + 60), await service.signingKey(env));
    assert.equal((await service.fetchImage(env, new URL(path, 'https://mail.example.test').searchParams)).status, 415);
});
