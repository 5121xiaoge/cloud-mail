import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import r2Service from './service/r2-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
import { handleWsUpgrade } from './websocket/connect';
import proxyService from './service/proxy-service';
import { isPublicObjKey } from './utils/att-headers';
export { MailHub } from './websocket/hub'; // Durable Object 必须从 Worker 入口导出
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		// WebSocket：浏览器连 /realtime，转到 MailHub Durable Object
		if (url.pathname === '/realtime') {
			return handleWsUpgrade(req, env);
		}

		// 邮件图片代理：校验链接签名后，由 Worker 代拉外链图。
		if (url.pathname === '/proxy') {
			return proxyService.fetchImage(env, url.searchParams);
		}

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		if (url.pathname.startsWith('/oss/')) {
			const key = url.pathname.slice('/oss/'.length);
			if (!isPublicObjKey(key)) {
				return new Response('Not Found', { status: 404 });
			}
			const resp = await r2Service.toObjResp({ env }, key);
			return resp || new Response('Not Found', { status: 404 });
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 if (!isPublicObjKey(url.pathname.substring(1))) {
				return new Response('Not Found', { status: 404 });
			}
			 const resp = await r2Service.toObjResp({ env }, url.pathname.substring(1));
			 return resp || new Response('Not Found', { status: 404 });
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		if (c.cron === '*/30 * * * *') {
			try {
				await analysisService.refreshEchartsCache({ env })
			} catch (e) {
				console.error('定时任务 refreshEchartsCache 执行失败', e);
			}
			return;
		}

		// 每个任务独立执行，某一步失败不影响后续任务
		const tasks = [
			['clearRecord', () => verifyRecordService.clearRecord({ env })],
			['resetDaySendCount', () => userService.resetDaySendCount({ env })],
			['completeReceiveAll', () => emailService.completeReceiveAll({ env })],
			['autoClean', () => emailService.autoClean({ env })],
			['clearNoBindOathUser', () => oauthService.clearNoBindOathUser({ env })],
			['refreshEchartsCache', () => analysisService.refreshEchartsCache({ env })]
		];

		for (const [name, task] of tasks) {
			try {
				await task();
			} catch (e) {
				console.error(`定时任务 ${name} 执行失败`, e);
			}
		}
	},
};
