import resendService from '../service/resend-service';
import app from '../hono/hono';

app.post('/webhooks',async (c) => {
	try {
		const raw = await c.req.text();
		await resendService.verifySignature(c, raw);
		await resendService.webhooks(c, JSON.parse(raw));
		return c.text('success', 200)
	} catch (e) {
		return c.text(e.message, e.code === 401 ? 401 : 500)
	}
})
