import BizError from '../error/biz-error';
import reqUtils from '../utils/req-utils';
import { t } from '../i18n/i18n';

// 登录防暴力破解（逐级加罚）：
// - 同一 IP + 邮箱 15 分钟内失败 5 次，或同一 IP 15 分钟内失败 30 次，触发锁定；
// - 锁定时长按累计锁定次数递增：15 分钟 -> 1 小时 -> 6 小时 -> 24 小时（封顶）；
// - 最近一次锁定结束后 24 小时内没有再次锁定，处罚等级清零；IP + 邮箱登录成功时立即清零。
const loginGuard = {

	policy: {
		prefix: 'login_fail:',
		pairMaxFails: 5,
		ipMaxFails: 30,
		windowSeconds: 15 * 60,
		lockSteps: [15 * 60, 60 * 60, 6 * 60 * 60, 24 * 60 * 60],
		levelMemorySeconds: 24 * 60 * 60
	},

	now() {
		return Math.floor(Date.now() / 1000);
	},

	async digest(value) {
		const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
		return [...new Uint8Array(buffer)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	// 记录格式 { count, last, level, lockUntil }；兼容旧版只有 { count } 的记录
	normalize(row, max, now) {
		const record = {
			count: Math.max(0, Number(row?.count) || 0),
			last: Number(row?.last) || 0,
			level: Math.max(0, Number(row?.level) || 0),
			lockUntil: Number(row?.lockUntil) || 0
		};
		if (row && !row.last) {
			record.last = now;
			if (record.count >= max) {
				// 旧版达到上限即处于锁定中，按第一级处理
				record.count = 0;
				record.level = Math.max(record.level, 1);
				record.lockUntil = now + this.policy.windowSeconds;
			}
		}
		if (now - record.last > this.policy.windowSeconds) {
			record.count = 0;
		}
		return record;
	},

	lockSeconds(level) {
		const steps = this.policy.lockSteps;
		return steps[Math.min(Math.max(level, 1), steps.length) - 1];
	},

	formatDuration(seconds) {
		if (seconds >= 60 * 60) {
			return t('durationHours', { count: Math.ceil(seconds / 3600) });
		}
		return t('durationMinutes', { count: Math.max(1, Math.ceil(seconds / 60)) });
	},

	lockedError(seconds) {
		return new BizError(t('loginLocked', { msg: this.formatDuration(seconds) }), 429);
	},

	// 失败一次；达到上限时升级处罚等级并返回本次锁定秒数
	addFailure(record, max, now) {
		record.count += 1;
		record.last = now;
		if (record.count < max) return 0;
		record.count = 0;
		record.level = Math.min(record.level + 1, this.policy.lockSteps.length);
		const seconds = this.lockSeconds(record.level);
		record.lockUntil = now + seconds;
		return seconds;
	},

	// 有处罚等级时，记录保留到锁定结束后 24 小时，用于累计加罚
	ttlFor(record, now) {
		const { windowSeconds, levelMemorySeconds } = this.policy;
		const ttl = record.level > 0
			? Math.max(windowSeconds, record.lockUntil + levelMemorySeconds - now)
			: windowSeconds;
		return Math.max(60, Math.ceil(ttl));
	},

	async check(c, email) {
		const ip = reqUtils.getIp(c);

		// 可选：绑定 Workers Rate Limiting（wrangler.toml 中 [[ratelimits]] name = "login_limiter"），原子计数，防并发绕过
		if (c.env.login_limiter?.limit) {
			try {
				const { success } = await c.env.login_limiter.limit({ key: 'login:' + ip });
				if (!success) throw new BizError(t('tooManyRequests'), 429);
			} catch (e) {
				if (e instanceof BizError) throw e;
				console.warn('Rate Limiting 调用异常', e.message);
			}
		}

		const { prefix, pairMaxFails, ipMaxFails } = this.policy;
		const now = this.now();
		const normalized = String(email || '').trim().toLowerCase();
		const state = {
			pairKey: prefix + 'p:' + await this.digest(ip + '|' + normalized),
			ipKey: prefix + 'i:' + await this.digest(ip),
			pair: this.normalize(null, pairMaxFails, now),
			ip: this.normalize(null, ipMaxFails, now)
		};

		try {
			const [pairRow, ipRow] = await Promise.all([
				c.env.kv.get(state.pairKey, { type: 'json' }),
				c.env.kv.get(state.ipKey, { type: 'json' })
			]);
			state.pair = this.normalize(pairRow, pairMaxFails, now);
			state.ip = this.normalize(ipRow, ipMaxFails, now);
		} catch (e) {
			console.warn('读取登录失败记录异常', e.message);
		}

		const lockUntil = Math.max(state.pair.lockUntil, state.ip.lockUntil);
		if (lockUntil > now) {
			throw this.lockedError(lockUntil - now);
		}

		return state;
	},

	// 记录一次失败；本次失败触发锁定时直接提示锁定时长
	async recordFailure(c, state) {
		const now = this.now();
		const pairLock = this.addFailure(state.pair, this.policy.pairMaxFails, now);
		const ipLock = this.addFailure(state.ip, this.policy.ipMaxFails, now);

		try {
			await Promise.all([
				c.env.kv.put(state.pairKey, JSON.stringify(state.pair), { expirationTtl: this.ttlFor(state.pair, now) }),
				c.env.kv.put(state.ipKey, JSON.stringify(state.ip), { expirationTtl: this.ttlFor(state.ip, now) })
			]);
		} catch (e) {
			console.warn('记录登录失败次数异常', e.message);
		}

		const lock = Math.max(pairLock, ipLock);
		if (lock) {
			throw this.lockedError(lock);
		}
	},

	async clear(c, state) {
		const { count, level, lockUntil } = state.pair;
		if (!count && !level && !lockUntil) return;
		try {
			await c.env.kv.delete(state.pairKey);
		} catch (e) {
			console.warn('清除登录失败记录异常', e.message);
		}
	}
};

export default loginGuard;
