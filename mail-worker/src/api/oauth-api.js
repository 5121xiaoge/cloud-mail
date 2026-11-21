import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/github/login', async (c) => {
	throw new BizError(t('oauthDisabled'));
});

app.post('/oauth/google/login', async (c) => {
	throw new BizError(t('oauthDisabled'));
});

app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	return c.json(result.ok(loginInfo))
})
