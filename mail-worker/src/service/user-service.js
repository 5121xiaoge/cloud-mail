import BizError from '../error/biz-error';
import domainUtils from '../utils/domain-utils';
import accountService from './account-service';
import orm from '../entity/orm';
import user from '../entity/user';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { emailConst, isDel, roleConst, settingConst, userConst } from '../const/entity-const';
import kvConst from '../const/kv-const';
import KvConst from '../const/kv-const';
import cryptoUtils from '../utils/crypto-utils';
import emailService from './email-service';
import dayjs from 'dayjs';
import permService from './perm-service';
import roleService from './role-service';
import emailUtils from '../utils/email-utils';
import saltHashUtils from '../utils/crypto-utils';
import constant from '../const/constant';
import { t } from '../i18n/i18n'
import reqUtils from '../utils/req-utils';
import {oauth} from "../entity/oauth";
import oauthService from "./oauth-service";
import adminMode from '../security/admin-mode';
import userContext from '../security/user-context';
import paramUtils from '../utils/param-utils';
import settingService from './setting-service';
import starService from './star-service';
import { revokeWsSessionsFromContext } from '../websocket/notify';

const userService = {

	async loginUserInfo(c, userId, selectedAccountId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const [account, roleRow, permKeys] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, userRow.email),
			roleService.selectById(c, userRow.type),
			adminMode.isAdmin(c, userRow.email) ? Promise.resolve(['*']) : permService.userPermKeys(c, userId)
		]);

		const user = {};
		user.userId = userRow.userId;
		user.sendCount = userRow.sendCount;
		user.email = userRow.email;
		user.account = account;
		user.name = account.name;
		user.permKeys = permKeys;
		user.role = roleRow;
		user.type = userRow.type;

		if (adminMode.isAdmin(c, userRow.email)) {
			user.role = constant.ADMIN_ROLE
			user.type = 0;
		}

		user.currentAccount = account;
		const accountId = Number(selectedAccountId);
		if (Number.isSafeInteger(accountId) && accountId > 0 && accountId !== account.accountId &&
			(permKeys.includes('*') || permKeys.includes('account:query'))) {
			const selectedAccount = await accountService.selectById(c, accountId);
			if (selectedAccount?.userId === user.userId) {
				user.currentAccount = selectedAccount;
			}
		}

		return user;
	},


	// 用户自助修改密码：必须校验原密码，修改后注销其它设备的会话
	async resetPassword(c, params, userId) {

		const { oldPassword, password } = params || {};

		const userRow = await this.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		if (typeof oldPassword !== 'string' || !oldPassword || !await cryptoUtils.verifyPassword(oldPassword, userRow.salt, userRow.password)) {
			throw new BizError(t('oldPwdIncorrect'));
		}

		await this.updatePassword(c, password, userId);

		const token = await userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (authInfo) {
			const removed = authInfo.tokens.filter(item => item !== token);
			authInfo.tokens = token ? authInfo.tokens.filter(item => item === token) : [];
			await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
			// 其它设备的会话已失效，同时断开它们的实时连接
			revokeWsSessionsFromContext(c, userId, removed);
		}
	},

	async updatePassword(c, password, userId) {

		if (typeof password !== 'string' || password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		if (password.length > 128) {
			throw new BizError(t('pwdLengthLimit'));
		}

		const { salt, hash } = await cryptoUtils.hashPassword(password, c);
		await orm(c).update(user).set({ password: hash, salt: salt }).where(eq(user.userId, userId)).run();
	},

	// 管理操作不能作用于超级管理员（超级管理员本人除外）
	async assertNotProtected(c, userIds) {
		const ids = Array.isArray(userIds) ? userIds : [userIds];
		const operator = userContext.getUser(c);
		if (adminMode.isAdmin(c, operator?.email)) return;
		if (!adminMode.adminEmail(c)) return;
		const rows = await orm(c).select({ email: user.email }).from(user).where(inArray(user.userId, ids.map(Number))).all();
		if (rows.some(row => adminMode.isAdmin(c, row.email))) {
			throw new BizError(t('protectedAdmin'), 403);
		}
	},

	async clearSessions(c, userIds) {
		const ids = Array.isArray(userIds) ? userIds : [userIds];
		await Promise.all(ids.map(id => c.env.kv.delete(KvConst.AUTH_INFO + id)));
		ids.forEach(id => revokeWsSessionsFromContext(c, id));
	},

	async updatePasswordHash(c, userId, hash, salt) {
		await orm(c).update(user).set({ password: hash, salt: salt }).where(eq(user.userId, userId)).run();

		// 个人设置改密：会话列表只留当前 uuid，其它设备下线。管理员改别人密码不走这里。
		if (c.get?.('user')?.userId !== userId) {
			return;
		}

		const sessionToken = await userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (!authInfo) {
			return;
		}
		const removed = authInfo.tokens.filter(item => item !== sessionToken);
		authInfo.tokens = sessionToken ? [sessionToken] : [];
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		revokeWsSessionsFromContext(c, userId, removed);
	},

	selectByEmail(c, email) {
		return orm(c).select().from(user).where(
			and(
				sql`${user.email} COLLATE NOCASE = ${email}`,
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		const { userId } = await orm(c).insert(user).values({ ...params }).returning().get();
		return userId;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(user).where(sql`${user.email} COLLATE NOCASE = ${email}`).get();
	},

	selectByIdIncludeDel(c, userId) {
		return orm(c).select().from(user).where(eq(user.userId, userId)).get();
	},

	selectById(c, userId) {
		return orm(c).select().from(user).where(
			and(
				eq(user.userId, userId),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async delete(c, userId) {
		const { syncDelete } = await settingService.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			await this.physicsDelete(c, { userIds: String(userId) });
			await c.env.kv.delete(kvConst.AUTH_INFO + userId)
			revokeWsSessionsFromContext(c, userId);
			return;
		}
		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, userId)).run();
		await c.env.kv.delete(kvConst.AUTH_INFO + userId)
		revokeWsSessionsFromContext(c, userId);
	},

	async physicsDelete(c, params) {
		const userIds = paramUtils.ids(params?.userIds, 90);
		await this.assertNotProtected(c, userIds);
		await accountService.physicsDeleteByUserIds(c, userIds);
		await oauthService.deleteByUserIds(c, userIds);
		await orm(c).delete(user).where(inArray(user.userId, userIds)).run();
		// 删除后立即注销这些用户的所有会话
		await this.clearSessions(c, userIds);
	},

	async list(c, params) {

		let { num, size, email, timeSort, status } = params;

		({ size, offset: num } = paramUtils.page(num, size, 50, 15));
		timeSort = Number(timeSort);
		params.isDel = Number(params.isDel);

		const conditions = [];

		if (status > -1) {
			conditions.push(eq(user.status, status));
			conditions.push(eq(user.isDel, isDel.NORMAL));
		}


		if (email) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${email + '%'}`);
		}


		if (params.isDel) {
			conditions.push(eq(user.isDel, params.isDel));
		}


		const query = orm(c).select({
			...user,
			username: oauth.username,
			trustLevel: oauth.trustLevel,
			avatar: oauth.avatar,
			name: oauth.name,
			platform: oauth.platform
		}).from(user).leftJoin(oauth, eq(oauth.userId, user.userId))
			.where(and(...conditions));


		if (timeSort) {
			query.orderBy(asc(user.userId));
		} else {
			query.orderBy(desc(user.userId));
		}

		const list = (await query.limit(size).offset(num)).map(row => {
			// 不向前端返回密码哈希与盐
			const { password: _password, salt: _salt, ...rest } = row;
			return rest;
		});

		const { total } = await orm(c)
			.select({ total: count() })
			.from(user)
			.where(and(...conditions)).get();
		const userIds = list.map(user => user.userId);

		const types = [...new Set(list.map(user => user.type))];

		const [emailCounts, delEmailCounts, sendCounts, delSendCounts, accountCounts, delAccountCounts, roleList] = await Promise.all([
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE, isDel.DELETE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND, isDel.DELETE),
			accountService.selectUserAccountCountList(c, userIds),
			accountService.selectUserAccountCountList(c, userIds, isDel.DELETE),
			roleService.selectByIdsHasPermKey(c, types,'email:send')
		]);

		const receiveMap = Object.fromEntries(emailCounts.map(item => [item.userId, item.count]));
		const sendMap = Object.fromEntries(sendCounts.map(item => [item.userId, item.count]));
		const accountMap = Object.fromEntries(accountCounts.map(item => [item.userId, item.count]));

		const delReceiveMap = Object.fromEntries(delEmailCounts.map(item => [item.userId, item.count]));
		const delSendMap = Object.fromEntries(delSendCounts.map(item => [item.userId, item.count]));
		const delAccountMap = Object.fromEntries(delAccountCounts.map(item => [item.userId, item.count]));

		for (const user of list) {

			const userId = user.userId;

			user.receiveEmailCount = receiveMap[userId] || 0;
			user.sendEmailCount = sendMap[userId] || 0;
			user.accountCount = accountMap[userId] || 0;

			user.delReceiveEmailCount = delReceiveMap[userId] || 0;
			user.delSendEmailCount = delSendMap[userId] || 0;
			user.delAccountCount = delAccountMap[userId] || 0;

			const roleIndex = roleList.findIndex(roleRow => user.type === roleRow.roleId);
			let sendAction = {};

			if (roleIndex > -1) {
				sendAction.sendType = roleList[roleIndex].sendType;
				sendAction.sendCount = roleList[roleIndex].sendCount;
				sendAction.hasPerm = true;
			} else {
				sendAction.hasPerm = false;
			}

			if (adminMode.isAdmin(c, user.email)) {
				sendAction.sendType = constant.ADMIN_ROLE.sendType;
				sendAction.sendCount = constant.ADMIN_ROLE.sendCount;
				sendAction.hasPerm = true;
				user.type = 0
			}

			user.sendAction = sendAction;
		}

		return { list, total };
	},

	async updateUserInfo(c, userId, recordCreateIp = false) {



		const activeIp = reqUtils.getIp(c);

		const {os, browser, device} = reqUtils.getUserAgent(c);

		const params = {
			os,
			browser,
			device,
			activeIp,
			activeTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		};

		if (recordCreateIp) {
			params.createIp = activeIp;
		}

		await orm(c)
			.update(user)
			.set(params)
			.where(eq(user.userId, userId))
			.run();
	},

	async setPwd(c, params) {

		const { password } = params || {};
		const userId = paramUtils.id(params?.userId);
		await this.assertNotProtected(c, userId);
		await this.updatePassword(c, password, userId);
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
		revokeWsSessionsFromContext(c, userId);
	},

	async setStatus(c, params) {

		const { status } = params || {};
		const userId = paramUtils.id(params?.userId);
		await this.assertNotProtected(c, userId);

		await orm(c)
			.update(user)
			.set({ status })
			.where(eq(user.userId, userId))
			.run();

		if (status === userConst.status.BAN) {
			await c.env.kv.delete(KvConst.AUTH_INFO + userId);
			revokeWsSessionsFromContext(c, userId);
		}
	},

	async setType(c, params) {

		const { type } = params || {};
		const userId = paramUtils.id(params?.userId);
		await this.assertNotProtected(c, userId);

		const roleRow = await roleService.selectById(c, type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, userId))
			.run();

		// 角色变化可能影响“全部邮件”实时通道的权限：让客户端重连并重新鉴权
		revokeWsSessionsFromContext(c, userId, null, { reconnect: true });

	},

	async incrUserSendCount(c, quantity, userId) {
		await orm(c).update(user).set({
			sendCount: sql`${user.sendCount}
	  +
	  ${quantity}`
		}).where(eq(user.userId, userId)).run();
	},

	// 原子预占发送额度：只有加上本次数量后不超过上限才会更新成功
	async reserveSendCount(c, userId, quantity, limit) {
		const rows = await orm(c).update(user)
			.set({ sendCount: sql`${user.sendCount} + ${quantity}` })
			.where(and(eq(user.userId, userId), sql`${user.sendCount} + ${quantity} <= ${limit}`))
			.returning({ userId: user.userId });
		return rows.length > 0;
	},

	async updateAllUserType(c, type, curType) {
		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.type, curType))
			.run();
	},

	async initAdmin(c) {
		const email = c.env.admin;
		const password = c.env.password;

		if (!email || !password) {
			return;
		}

		const exist = await userService.selectByEmailIncludeDel(c, email);
		if (exist) {
			return;
		}

		const role = await roleService.selectDefaultRole(c);
		const { salt, hash } = await cryptoUtils.hashPassword(password);
		const userId = await userService.insert(c, {
			email,
			password: hash,
			salt,
			type: role?.roleId || 1
		});
		await userService.updateUserInfo(c, userId, true);
		await accountService.insert(c, {
			userId,
			email,
			name: emailUtils.getName(email)
		});
	},

	async add(c, params) {

		let { email, type, password } = params;

		if (typeof email !== 'string' || typeof password !== 'string') {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		if (!domainUtils.isOwnDomain(c, email)) {
			throw new BizError(t('notEmailDomain'));
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const role = await roleService.selectById(c, type);

		if (!role) {
			throw new BizError(t('roleNotExist'));
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password, c);

		const userId = await userService.insert(c, { email, password: hash, salt, type });

		await userService.updateUserInfo(c, userId, true);

		await accountService.insert(c, { userId: userId, email, type, name: emailUtils.getName(email) });
	},

	async resetDaySendCount(c) {
		const roleList = await roleService.selectByIdsAndSendType(c, 'email:send', roleConst.sendType.DAY);
		const roleIds = roleList.map(action => action.roleId);
		await orm(c).update(user).set({ sendCount: 0 }).where(inArray(user.type, roleIds)).run();
	},

	async resetSendCount(c, params) {
		const userId = paramUtils.id(params?.userId);
		await orm(c).update(user).set({ sendCount: 0 }).where(eq(user.userId, userId)).run();
	},

	async restore(c, params) {
		const { type } = params || {};
		const userId = paramUtils.id(params?.userId);
		await orm(c)
			.update(user)
			.set({ isDel: isDel.NORMAL })
			.where(eq(user.userId, userId))
			.run();
		const userRow = await this.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}
		await accountService.restoreByEmail(c, userRow.email);

		if (type) {
			await emailService.restoreByUserId(c, userId);
			await accountService.restoreByUserId(c, userId);
		}

	},

	listByRegKeyId(c, regKeyId) {
		return orm(c)
			.select({email: user.email,createTime: user.createTime})
			.from(user)
			.where(eq(user.regKeyId, regKeyId))
			.orderBy(desc(user.userId))
			.all();
	}
};

export default userService;
