import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, babelParse } from 'vue/compiler-sfc';
import { createRouter, createMemoryHistory } from 'vue-router';

const routerSource = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8');
const routesNode = babelParse(routerSource, { sourceType: 'module' }).program.body
    .find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'routes')
    .declarations[0].init;
const routes = new Function(`return (${routerSource.slice(routesNode.start, routesNode.end)});`)();
const router = createRouter({ history: createMemoryHistory(), routes });

for (const [view, mailbox, delType] of [
    ['email', 'inbox', 'logic'],
    ['send', 'sent', 'logic'],
    ['star', 'starred', 'logic'],
    ['all-email', 'all-mail', 'physics'],
]) {
    test(`${view} opens the registered detail route in its own mailbox`, () => {
        const { descriptor } = parse(readFileSync(new URL(`../src/views/${view}/index.vue`, import.meta.url), 'utf8'));
        const script = descriptor.scriptSetup.content;
        const handler = babelParse(script, { sourceType: 'module' }).program.body
            .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'jumpContent');
        const message = { emailId: 1, content: '<p>Fixture message</p>', attList: [] };
        const emailStore = { contentData: {}, toContentEmail: email => email };
        let resolved;
        const jumpContent = new Function('emailStore', 'router',
            `${script.slice(handler.start, handler.end)}; return jumpContent;`)(
            emailStore, { push: target => { resolved = router.resolve(target); } },
        );
        jumpContent(message);
        assert.equal(resolved.name, 'content');
        assert.equal(resolved.path, `/${mailbox}/messages`);
        assert.equal(resolved.params.mailbox, mailbox);
        assert.equal(emailStore.contentData.email, message);
        assert.equal(emailStore.contentData.delType, delType);
        if (view === 'email') assert.equal(emailStore.contentData.showUnread, true);
        if (view === 'all-email') {
            assert.equal(emailStore.contentData.showReply, false);
            assert.equal(emailStore.contentData.showStar, false);
        }
    });
}

test('legacy message URLs redirect to the inbox detail without hiding other missing routes', () => {
    for (const path of ['/message', '/messages']) {
        const resolved = router.resolve(path);
        const redirect = resolved.matched.at(-1).redirect;
        assert.equal(redirect, '/inbox/messages');
        assert.equal(router.resolve(redirect).name, 'content');
    }
    assert.equal(router.resolve('/missing-page').name, '404');
});
