import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { eq, inArray } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import jwtUtils from "../utils/jwt-utils";
import { t } from "../i18n/i18n";
import adminMode from "../security/admin-mode";

const OAUTH_BIND_PURPOSE = 'oauth-bind';
const OAUTH_BIND_EXPIRE = 60 * 30;

const oauthService = {

	async bindUser(c, params) {

		if (adminMode.isAdminOnly(c)) {
			throw new BizError(t('oauthDisabled'));
		}

		const { email, code, bindToken } = params || {};

		// 绑定必须携带 LinuxDo 授权后签发的短期凭证，防止伪造 oauthUserId 抢绑
		const ticket = await jwtUtils.verifyToken(c, bindToken);

		if (!ticket || ticket.purpose !== OAUTH_BIND_PURPOSE || !ticket.oauthUserId) {
			throw new BizError(t('oauthBindExpired'));
		}

		const oauthUserId = String(ticket.oauthUserId);
		const oauthRow = await this.getById(c, oauthUserId);

		if (!oauthRow) {
			throw new BizError(t('oauthBindExpired'));
		}

		const boundUser = oauthRow.userId ? await userService.selectByIdIncludeDel(c, oauthRow.userId) : null;

		if (boundUser) {
			throw new BizError(t('oauthAlreadyBound'));
		}

		await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(16), code }, true);

		const userRow = await userService.selectByEmail(c, email);

		await orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthUserId, oauthUserId)).run();
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: { ...oauthRow, userId: userRow.userId }, token: jwtToken }
	},

	async linuxDoLogin(c, params) {

		const { code } = params || {};

		const linuxdoSwitch = !adminMode.isAdminOnly(c) && (c.env.linuxdo_switch === true || c.env.linuxdo_switch === 'true');

		if (!linuxdoSwitch) {
			throw new BizError(t('oauthDisabled'));
		}

		if (typeof code !== 'string' || !code) {
			throw new BizError(t('oauthFailed'));
		}

		let token = '';
		let userInfo = {}

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', c.env.linuxdo_client_id)
		reqParams.append('client_secret', c.env.linuxdo_client_secret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', c.env.linuxdo_callback_url)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		token = await tokenRes.json()

		const userRes = await fetch('https://connect.linux.do/api/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		const { active, silenced } = userInfo;
		userInfo.active = active ? 0 : 1;
		userInfo.silenced = silenced ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;

		const  oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			const bindToken = await jwtUtils.generateToken(c, { purpose: OAUTH_BIND_PURPOSE, oauthUserId: oauthRow.oauthUserId }, OAUTH_BIND_EXPIRE);
			return { userInfo: oauthRow, token: null, bindToken }
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken }
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},

	async getById(c, oauthUserId) {
		return await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

}

export default  oauthService
