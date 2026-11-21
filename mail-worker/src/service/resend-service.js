import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import cryptoUtils from '../utils/crypto-utils';

const resendService = {

	// 配置 resend_webhook_secret 后校验 Svix 签名，防止伪造投递状态回调
	async verifySignature(c, raw) {

		const secret = c.env.resend_webhook_secret;

		if (!secret) {
			return;
		}

		const id = c.req.header('svix-id');
		const timestamp = c.req.header('svix-timestamp');
		const signatureHeader = c.req.header('svix-signature');

		if (!id || !timestamp || !signatureHeader) {
			throw new BizError('Invalid webhook signature', 401);
		}

		const now = Math.floor(Date.now() / 1000);

		if (!Number.isFinite(Number(timestamp)) || Math.abs(now - Number(timestamp)) > 300) {
			throw new BizError('Webhook timestamp expired', 401);
		}

		const keyBytes = Uint8Array.from(atob(String(secret).replace(/^whsec_/, '')), ch => ch.charCodeAt(0));
		const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${raw}`));
		const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));

		const valid = signatureHeader.split(' ').some(part => {
			const [version, value] = part.split(',');
			return version === 'v1' && cryptoUtils.safeEqual(value, expected);
		});

		if (!valid) {
			throw new BizError('Invalid webhook signature', 401);
		}
	},

	async webhooks(c, body) {

		const params = {
			resendEmailId: body.data.email_id,
			status: emailConst.status.SENT
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			let bounce = body.data.bounce
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = body.data.failed.reason
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default resendService
