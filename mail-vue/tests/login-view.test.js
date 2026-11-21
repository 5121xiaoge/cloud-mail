import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, babelParse } from 'vue/compiler-sfc';

const source = readFileSync(new URL('../src/views/login/index.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = descriptor.scriptSetup.content;
const getFullEmail = babelParse(script, { sourceType: 'module' }).program.body
    .find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'getFullEmail')
    .declarations[0].init;
const emailFunction = (hideDomain = false, suffix = '@110xg.cyou') =>
    new Function('hideLoginDomain', 'suffix', `return (${script.slice(getFullEmail.start, getFullEmail.end)});`)(
        { value: hideDomain }, { value: suffix },
    );

test('login appends the chosen suffix to a username but leaves a full email unchanged', () => {
    const complete = emailFunction();
    assert.equal(complete(' admin '), 'admin@110xg.cyou');
    assert.equal(complete('reader@another.example.test'), 'reader@another.example.test');
    assert.equal(emailFunction(true)(' reader@example.test '), 'reader@example.test');
});

test('login has no GitHub footer link and keeps the suffix outside the input append slot', () => {
    assert.doesNotMatch(descriptor.template.content, /github/i);
    assert.match(descriptor.template.content, /class="email-control"/);
    assert.match(descriptor.template.content, /v-if="showDomainSelect"/);
    assert.doesNotMatch(descriptor.template.content, /#append/);
    assert.match(script, /!form\.email\.includes\('@'\)/);
});
