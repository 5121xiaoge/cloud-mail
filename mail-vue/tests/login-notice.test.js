import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('successful login still enters the mailbox without automatically opening a notice', () => {
    const source = readSource('views/login/index.vue');
    assert.match(source, /await router\.replace\(\{name: 'layout'\}\)/);
    assert.doesNotMatch(source, /uiStore\.showNotice\s*\(/);
});

test('manual notice viewing and administrator preview remain available', () => {
    const header = readSource('layout/header/index.vue');
    const settings = readSource('views/sys-setting/index.vue');
    const main = readSource('layout/main/index.vue');

    assert.match(header, /@click="openNotice"/);
    assert.match(header, /uiStore\.showNotice\(\)/);
    assert.match(settings, /uiStore\.showNotice\(\)/);
    assert.match(settings, /uiStore\.previewNotice\(\{\.\.\.noticeForm\}\)/);
    assert.match(main, /watch\(\(\) => uiStore\.changeNotice/);
    assert.match(main, /watch\(\(\) => uiStore\.changePreview/);
});
