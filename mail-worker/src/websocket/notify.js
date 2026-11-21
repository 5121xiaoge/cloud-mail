// 全部邮件页共用的 Durable Object 名；个人收件箱用 userId。
export const ALL_EMAIL_HUB = 'all-email';

// 新邮件入库后推送：有 userId 则通知该用户收件箱；始终通知全部邮件通道。
// 无人收件时 userId 为 0，没有个人收件箱，只推全部邮件。
// 失败不影响收信，用 waitUntil 挂到当前 Worker 生命周期。
export function notifyMailWs(env, ctx, emailRow) {
	if (!env?.ws) {
		return;
	}

	const payload = {
		type: 'new_message',
		emailId: emailRow?.emailId,
		accountId: emailRow?.accountId,
		userId: emailRow?.userId || 0
	};

	const tasks = [];
	if (emailRow?.userId) {
		tasks.push(env.ws.getByName(String(emailRow.userId)).notify(payload));
	}
	tasks.push(env.ws.getByName(ALL_EMAIL_HUB).notify(payload));

	const task = Promise.all(tasks).catch(err => {
		console.error('ws notify failed', err);
	});

	if (ctx && typeof ctx.waitUntil === 'function') {
		ctx.waitUntil(task);
	} else {
		void task;
	}
}

// Hono 请求里取 executionCtx 再推送（站内互发走 HTTP，没有独立的 email handler ctx）。
export function notifyMailWsFromContext(c, emailRow) {
	let ctx;
	try {
		ctx = c.executionCtx;
	} catch {
		ctx = undefined;
	}
	notifyMailWs(c.env, ctx, emailRow);
}


// 会话失效（退出、改密码、封禁、删除等）时断开实时连接。
// sessions 为空表示该用户的全部连接；reconnect=true 表示让客户端重连以重新鉴权（如权限变化）。
export function revokeWsSessions(env, ctx, userId, sessions = null, { reconnect = false } = {}) {
	if (!env?.ws || !userId) {
		return;
	}
	const list = Array.isArray(sessions) ? sessions.filter(Boolean).map(String) : null;
	if (list && list.length === 0) {
		return;
	}
	const payload = { userId: String(userId), sessions: list, reconnect };
	const task = Promise.all([String(userId), ALL_EMAIL_HUB].map(name => env.ws.getByName(name).revoke(payload)))
		.catch(err => console.error('ws revoke failed', err));
	if (ctx && typeof ctx.waitUntil === 'function') {
		ctx.waitUntil(task);
	} else {
		void task;
	}
}

export function revokeWsSessionsFromContext(c, userId, sessions = null, options) {
	let ctx;
	try {
		ctx = c.executionCtx;
	} catch {
		ctx = undefined;
	}
	revokeWsSessions(c.env, ctx, userId, sessions, options);
}
