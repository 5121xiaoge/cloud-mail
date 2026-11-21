import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

function parseOrigins(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) return parsed;
	} catch (e) {
		// 非 JSON 时按逗号分隔处理
	}
	return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

// 可通过环境变量 cors_origin 限制跨域来源，未配置时保持原有行为
app.use('*', async (c, next) => {
	const origins = parseOrigins(c.env?.cors_origin);
	return cors({ origin: origins.length > 0 ? origins : '*' })(c, next);
});

app.use('*', async (c, next) => {
	await next();
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.onError((err, c) => {
	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return c.json(result.fail('KV数据库未绑定<br/>KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return c.json(result.fail('KV数据库未绑定<br/>KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return c.json(result.fail('D1数据库未绑定<br/>D1 database not bound',502));
	}

	if (err.message?.includes('D1_ERROR: no such column')) {
		return c.json(result.fail('请按照文档更新数据库<br/>Please update the database as documented',502));
	}

	if (err.name === 'BizError') {
		return c.json(result.fail(err.message, err.code));
	}

	// 未知异常不向前端暴露内部细节，详情见 Workers 日志；调试时可设置 expose_error = true
	const expose = c.env?.expose_error === true || c.env?.expose_error === 'true';
	return c.json(result.fail(expose ? err.message : '服务器内部错误 Internal Server Error', 500));
});

export default app;


