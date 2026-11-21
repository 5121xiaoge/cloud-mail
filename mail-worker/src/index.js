import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await kvObjService.toObjResp( { env }, url.pathname.substring(1));
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
