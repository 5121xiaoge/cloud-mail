import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicObjKey } from '../../mail-worker/src/utils/att-headers.js';
import domainUtils from '../../mail-worker/src/utils/domain-utils.js';
import forwardMime from '../../mail-worker/src/utils/forward-mime.js';
import { attUrl, verifyAttLink, attAccessAllowed, signAttContent, linkExpiry } from '../../mail-worker/src/utils/att-sign.js';

test('public object keys are limited to attachments and static assets', () => {
    for (const key of ['attachments/a.png', 'static/background/b.jpg', 'attachments/%E6%96%87.pdf']) {
        assert.equal(isPublicObjKey(key), true, key);
    }
    for (const key of ['setting:', 'public_key:', 'auth-uid:1', 'attachments/../setting:', 'attachments%2F..%2Fsetting:',
        '/attachments/a.png', 'attachments\\a', '', '%E0%A4%A']) {
        assert.equal(isPublicObjKey(key), false, key);
    }
});

test('own domain matching is exact and accepts array, JSON and comma separated configuration', () => {
    for (const domain of [['a.com', 'b.com'], '["a.com","b.com"]', 'a.com, b.com']) {
        const c = { env: { domain } };
        assert.equal(domainUtils.isOwnDomain(c, 'x@A.com'), true);
        assert.equal(domainUtils.isOwnDomain(c, 'x@b.com'), true);
        assert.equal(domainUtils.isOwnDomain(c, 'x@a.co'), false);
        assert.equal(domainUtils.isOwnDomain(c, 'x@com'), false);
        assert.equal(domainUtils.isOwnDomain(c, 'nobody'), false);
    }
});

test('forwarded mail headers cannot be injected through names, subjects or addresses', () => {
    const raw = forwardMime.build({
        accountEmail: 'me@example.test',
        name: 'Evil\r\nBcc: victim@example.test',
        receiveEmail: ['to@example.test\r\nBcc: x@example.test'],
        subject: 'Hi\r\nBcc: y@example.test',
        sendType: 'reply',
        messageId: '<id@example.test>\r\nBcc: z@example.test',
        text: 'body',
    });
    const headers = raw.split('\r\n\r\n')[0].split('\r\n');
    assert.equal(headers.some(line => /^bcc:/i.test(line)), false, headers.join('\n'));
    assert.ok(headers.some(line => line.startsWith('From: ')));
});

test('attachment links are signed, expire and are bound to their key', async () => {
    const env = { jwt_secret: crypto.randomUUID() };
    const url = new URL(await attUrl(env, 'attachments/a.png'), 'https://mail.example.test');
    assert.equal(url.pathname, '/attachments/a.png');
    assert.equal(await verifyAttLink(env, 'attachments/a.png', url.searchParams), true);
    assert.equal(await verifyAttLink(env, 'attachments/b.png', url.searchParams), false);
    assert.equal(await verifyAttLink({ jwt_secret: 'other' }, 'attachments/a.png', url.searchParams), false);
    const expired = new URLSearchParams(url.searchParams);
    expired.set('exp', String(Math.floor(Date.now() / 1000) - 10));
    assert.equal(await verifyAttLink(env, 'attachments/a.png', expired), false);
    assert.equal(await attAccessAllowed(env, 'attachments/a.png', new URLSearchParams()), false);
    assert.equal(await attAccessAllowed(env, 'static/background/a.png', new URLSearchParams()), true);
    assert.equal(await attAccessAllowed({ ...env, att_public: 'true' }, 'attachments/a.png', new URLSearchParams()), true);
    assert.ok(linkExpiry() % 3600 === 0 && linkExpiry() > Date.now() / 1000 + 23 * 3600);
});

test('email content placeholders are replaced with signed attachment links', async () => {
    const env = { jwt_secret: crypto.randomUUID() };
    const html = '<img src="{{domain}}attachments/a.png"><img src="{{domain}}attachments/a.png"><a href="https://x.test">x</a>';
    const signed = await signAttContent(env, html);
    assert.equal(signed.includes('{{domain}}'), false);
    const src = signed.match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&');
    const url = new URL(src, 'https://mail.example.test');
    assert.equal(await verifyAttLink(env, 'attachments/a.png', url.searchParams), true);
    const kept = await signAttContent(env, html, { keepPlaceholder: true });
    assert.match(kept, /src="\{\{domain\}\}attachments\/a\.png\?exp=\d+&amp;sig=/);
    assert.equal(await signAttContent(env, '<p>plain</p>'), '<p>plain</p>');
});
