import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, workerObject } from './worker-harness.js';

function sqliteFixture(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    const prepare = (sql, params = []) => ({
        sql, params, bind: (...values) => prepare(sql, values),
        run: async () => sqlite.prepare(sql).run(...params),
        first: async () => sqlite.prepare(sql).get(...params),
        all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    });
    const db = { prepare, async batch(statements) {
        sqlite.exec('BEGIN');
        try {
            const results = statements.map(statement => sqlite.prepare(statement.sql).run(...statement.params));
            sqlite.exec('COMMIT');
            return results;
        } catch (error) {
            sqlite.exec('ROLLBACK');
            throw error;
        }
    } };
    return { sqlite, c: { env: { db } } };
}
const upgradeSteps = ['v2_3DB', 'v2_4DB', 'v2_5DB', 'v2_6DB', 'v2_7DB', 'v2_8DB',
    'v3_0DB', 'v3_1DB', 'v3_2DB', 'v3_3DB', 'v3_4DB', 'v3_5DB', 'v3_6DB', 'customDB'];

test('local schema upgrades preserve customized dimming, accounts and password hashes and are repeatable',
    { skip: !DatabaseSync && 'Node SQLite is unavailable' }, async t => {
        const { sqlite, c } = sqliteFixture(t);
        const init = workerObject('init/init.js', 'dbInit', { console: { warn() {} } });
        await init.intDB(c);
        sqlite.exec('ALTER TABLE setting ADD COLUMN login_darken_factor INTEGER NOT NULL DEFAULT 0');
        sqlite.exec('UPDATE setting SET login_darken_factor=0.42,auto_refresh=0');
        const hash = crypto.randomUUID(), salt = crypto.randomUUID();
        sqlite.prepare("INSERT INTO user(email,password,salt) VALUES('admin@example.test',?,?)").run(hash, salt);
        sqlite.exec("INSERT INTO account(email,user_id) VALUES('admin@example.test',1)");
        for (let round = 0; round < 2; round++) {
            for (const method of upgradeSteps) await init[method](c);
            assert.equal(sqlite.prepare('SELECT login_darken_factor FROM setting').get().login_darken_factor, 0.42);
            assert.equal(sqlite.prepare('SELECT auto_refresh FROM setting').get().auto_refresh, 1);
            assert.equal(sqlite.prepare('SELECT auto_clean_days FROM setting').get().auto_clean_days, 0);
            assert.equal(sqlite.prepare('SELECT sync_delete FROM setting').get().sync_delete, 1);
            assert.equal(sqlite.prepare('SELECT login_verify FROM setting').get().login_verify, 1);
            assert.deepEqual({ ...sqlite.prepare('SELECT password,salt FROM user').get() }, { password: hash, salt });
            assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM account').get().count, 1);
        }
    });

test('automatic password rehashing during login does not require an authenticated request context', async () => {
    let updates = 0;
    const service = workerObject('service/user-service.js', 'userService', {
        orm: () => ({ update: () => ({ set: () => ({ where: () => ({ run: async () => updates++ }) }) }) }),
        user: { userId: {} }, eq: () => null,
    });
    await service.updatePasswordHash({}, 1, crypto.randomUUID(), crypto.randomUUID());
    assert.equal(updates, 1);
});

test('existing administrator initialization leaves the stored account and password unchanged', async () => {
    let inserted = 0;
    const service = workerObject('service/user-service.js', 'userService', {
        userService: { selectByEmailIncludeDel: async () => ({ userId: 1 }), insert: async () => inserted++ },
    });
    await service.initAdmin({ env: { admin: 'admin@example.test', password: crypto.randomUUID() } });
    assert.equal(inserted, 0);
});

test('daily maintenance follows the configured schedule without a second UTC-midnight restriction', async () => {
    let clears = 0, resets = 0;
    const verify = workerObject('service/verify-record-service.js', 'verifyRecordService', {
        orm: () => ({ delete: () => ({ run: async () => clears++ }) }), verifyRecord: {},
    });
    const user = workerObject('service/user-service.js', 'userService', {
        orm: () => ({ update: () => ({ set: () => ({ where: () => ({ run: async () => resets++ }) }) }) }),
        roleService: { selectByIdsAndSendType: async () => [{ roleId: 1 }] },
        roleConst: { sendType: { DAY: 'day' } }, user: { type: {} }, inArray: () => null,
    });
    await verify.clearRecord({});
    await user.resetDaySendCount({});
    assert.equal(clears, 1);
    assert.equal(resets, 1);
});
