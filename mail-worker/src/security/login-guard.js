import BizError from '../error/biz-error';
import reqUtils from '../utils/req-utils';
import { t } from '../i18n/i18n';

// 登录防暴力破解：同一 IP + 邮箱 15 分钟内失败 5 次锁定；同一 IP 失败 30 次锁定
const PREFIX = 'login_fail:';
const PAIR_MAX_FAILS = 5;
const IP_MAX_FAILS = 30;
const WINDOW_SECONDS = 15 * 60;

async function digest(value) {
	const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(buffer)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

const loginGuard = {

	async check(c, email) {
		const ip = reqUtils.getIp(c);

		// 可选：绑定 Workers Rate Limiting（wrangler.toml 中 [[unsafe.bindings]] name = "login_limiter"），原子计数，防并发绕过
		if (c.env.login_limiter?.limit) {
			try {
				const { success } = await c.env.login_limiter.limit({ key: 'login:' + ip });
				if (!success) throw new BizError(t('tooManyRequests'), 429);
			} catch (e) {
				if (e instanceof BizError) throw e;
				console.warn('Rate Limiting 调用异常', e.message);
			}
		}

		const normalized = String(email || '').trim().toLowerCase();
		const state = {
			pairKey: PREFIX + 'p:' + await digest(ip + '|' + normalized),
			ipKey: PREFIX + 'i:' + await digest(ip),
			pairCount: 0,
			ipCount: 0
		};

		try {
			const [pair, ipRow] = await Promise.all([
				c.env.kv.get(state.pairKey, { type: 'json' }),
				c.env.kv.get(state.ipKey, { type: 'json' })
			]);
			state.pairCount = Number(pair?.count) || 0;
			state.ipCount = Number(ipRow?.count) || 0;
		} catch (e) {
			console.warn('读取登录失败记录异常', e.message);
		}

		if (state.pairCount >= PAIR_MAX_FAILS || state.ipCount >= IP_MAX_FAILS) {
			throw new BizError(t('loginLocked', { msg: WINDOW_SECONDS / 60 }), 429);
		}

		return state;
	},

	async recordFailure(c, state) {
		try {
			await Promise.all([
				c.env.kv.put(state.pairKey, JSON.stringify({ count: state.pairCount + 1 }), { expirationTtl: WINDOW_SECONDS }),
				c.env.kv.put(state.ipKey, JSON.stringify({ count: state.ipCount + 1 }), { expirationTtl: WINDOW_SECONDS })
			]);
		} catch (e) {
			console.warn('记录登录失败次数异常', e.message);
		}
	},

	async clear(c, state) {
		if (!state.pairCount) return;
		try {
			await c.env.kv.delete(state.pairKey);
		} catch (e) {
			console.warn('清除登录失败记录异常', e.message);
		}
	}
};

export default loginGuard;
