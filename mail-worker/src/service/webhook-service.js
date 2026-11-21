import domainUtils from '../utils/domain-utils';
import { signAttContent } from '../utils/att-sign';

const webhookService = {

	async sendEmail(c, emailRow, webhookUrl, retry = 0, webhookSecret) {

		webhookUrl = domainUtils.toOssDomain(webhookUrl);

		if (!webhookUrl) {
			return;
		}

		retry = Number(retry);
		if (isNaN(retry) || retry < 0) {
			retry = 0;
		}
		retry = Math.min(retry, 5);

		const headers = {
			'Content-Type': 'application/json'
		};

		if (webhookSecret) {
			headers['Authorization'] = webhookSecret;
		}

		const body = JSON.stringify({
			emailId: emailRow.emailId,
			sendEmail: emailRow.sendEmail,
			sendName: emailRow.name,
			toEmail: emailRow.toEmail,
			toName: emailRow.toName,
			subject: emailRow.subject,
			text: emailRow.text,
			// 保留 {{domain}} 占位符，附件地址追加 24 小时有效的签名
			content: await signAttContent(c.env, emailRow.content, { keepPlaceholder: true }),
			code: emailRow.code,
			createTime: emailRow.createTime
		});

		let lastError = '';

		for (let i = 0; i <= retry; i++) {
			if (i > 0) {
				// 重试前递增等待，避免瞬间连续请求
				await new Promise(resolve => setTimeout(resolve, Math.min(1000 * i, 5000)));
			}
			try {
				const res = await fetch(webhookUrl, {
					method: 'POST',
					headers,
					body
				});

				if (res.ok) {
					return;
				}

				lastError = `status: ${res.status} response: ${await res.text()}`;
			} catch (e) {
				lastError = e.message;
			}
		}

		console.error(`Webhook 推送失败: ${lastError}`);
	}

};

export default webhookService;
