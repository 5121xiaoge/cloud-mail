import r2Service from '../service/r2-service';
import app from '../hono/hono';
import fileUtils from '../utils/file-utils';
import { isPublicObjKey } from '../utils/att-headers';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];

	if (!key || !isPublicObjKey(key)) {
		return c.text('Not Found', 404);
	}

	const obj = await r2Service.getObj(c, key);

	if (!obj) {
		return c.text('Not Found', 404);
	}

	if (obj instanceof Response) {
		return obj;
	}

	return new Response(obj.body, {
		headers: fileUtils.safeObjHeaders(obj.httpMetadata?.contentType, obj.httpMetadata?.contentDisposition, obj.httpMetadata?.cacheControl)
	});
});
