import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {settingConst, verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import adminMode from '../security/admin-mode';
import domainUtils from '../utils/domain-uitls';
import { sanitizeEmailHtml } from '../utils/html-sanitize';

// 允许通过 /setting/set 修改的字段（与 setting 表一致），其余字段一律忽略
const SETTABLE_FIELDS = Object.keys(setting).filter(key => key !== 'background' && setting[key] && typeof setting[key] === 'object' && 'columnType' in setting[key]);

// 背景图只允许常见位图，禁止 SVG 等可执行内容
const BACKGROUND_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif'];

// 敏感字段：查询时只返回遮掩值；保存时忽略仍带遮掩标记的值，避免前端回传遮掩值覆盖真实密钥
const MASK = '******';
const SECRET_FIELDS = ['secretKey', 's3AccessKey', 's3SecretKey', 'tgBotToken', 'webhookSecret', 'linuxdoClientSecret', 'githubClientSecret', 'googleClientSecret'];
const maskValue = (value, keep) => value ? `${String(value).slice(0, keep)}${MASK}` : value;

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		settingRow.r2Domain = '';
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;

		let projectLink = c.env.project_link;
		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;

		setting.adminOnly = adminMode.isAdminOnly(c);
		let linuxdoSwitch = c.env.linuxdo_switch === true || c.env.linuxdo_switch === 'true';

		if (setting.adminOnly) {
			// 超级管理员单用户模式：强制关闭注册与第三方登录
			setting.register = settingConst.register.CLOSE;
			linuxdoSwitch = false;
			setting.loginVerify = settingConst.loginVerify.CLOSE;
			setting.githubSwitch = 1;
			setting.googleSwitch = 1;
		}
		setting.loginVerify ??= settingConst.loginVerify.CLOSE;
		setting.loginVerifyCount ??= 1;

		setting.linuxdoClientId = linuxdoSwitch ? c.env.linuxdo_client_id : '';
		setting.linuxdoCallbackUrl = linuxdoSwitch ? c.env.linuxdo_callback_url : '';
		setting.linuxdoSwitch = linuxdoSwitch;

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);
		setting.autoRefresh = [0, 1].includes(Number(setting.autoRefresh)) ? 1 : 2; // 兼容旧的 0 关闭

		c.set?.('setting', setting);
		return setting;
	},

	async get(c) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);

		settingRow.secretKey = maskValue(settingRow.secretKey, 4) || null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = maskValue(settingRow.resendTokens[key], 6);
		});

		settingRow.s3AccessKey = maskValue(settingRow.s3AccessKey, 4) || null;
		settingRow.s3SecretKey = maskValue(settingRow.s3SecretKey, 2) || null;
		settingRow.tgBotToken = maskValue(settingRow.tgBotToken, 6) || null;
		settingRow.webhookSecret = maskValue(settingRow.webhookSecret, 2) || '';
		settingRow.linuxdoClientSecret = maskValue(settingRow.linuxdoClientSecret, 2) || '';
		settingRow.githubClientSecret = maskValue(settingRow.githubClientSecret, 2) || '';
		settingRow.googleClientSecret = maskValue(settingRow.googleClientSecret, 2) || '';
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false
		let loginVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
			if (row.type === verifyRecordType.LOGIN) {
				loginVerifyOpen = row.count >= settingRow.loginVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen
		settingRow.loginVerifyOpen = loginVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, input) {
		const settingData = await this.query(c);
		const params = {};
		for (const key of SETTABLE_FIELDS) {
			if (input && Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
				params[key] = input[key];
			}
		}
		for (const key of SECRET_FIELDS) {
			if (typeof params[key] === 'string' && params[key].includes(MASK)) {
				delete params[key];
			}
		}
		// 公告以 HTML 形式展示给所有用户，保存前清洗，防止存储型 XSS
		if (typeof params.noticeContent === 'string') {
			params.noticeContent = sanitizeEmailHtml(params.noticeContent);
		}
		if (settingData.adminOnly) {
			params.register = settingConst.register.CLOSE;
			params.loginVerify = settingConst.loginVerify.CLOSE;
			params.linuxdoSwitch = 1;
			params.githubSwitch = 1;
			params.googleSwitch = 1;
		}
		const inputTokens = Object.fromEntries(Object.entries(input?.resendTokens || {})
			.filter(([, value]) => !(typeof value === 'string' && value.includes(MASK))));
		let resendTokens = { ...settingData.resendTokens, ...inputTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		if (params.webhookUrl !== undefined) {
			params.webhookUrl = domainUtils.toOssDomain(params.webhookUrl) || '';
		}
		if (params.loginDarkenFactor !== undefined) {
			const factor = Number(params.loginDarkenFactor);
			params.loginDarkenFactor = Number.isNaN(factor) ? 0 : Math.min(1, Math.max(0, factor));
		}

		params.resendTokens = JSON.stringify(resendTokens);

		if (params.autoRefresh !== undefined) {
			params.autoRefresh = Number(params.autoRefresh) === 1 ? 1 : 2;
		}

		if (params.loginVerifyCount !== undefined && (!Number.isSafeInteger(params.loginVerifyCount) || params.loginVerifyCount < 1)) {
			params.loginVerifyCount = 1;
		}

		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params || {};
		const { background: oldBackground } = await this.query(c);

		if (typeof background !== 'string' || !background) {
			throw new BizError(t('invalidBackground'));
		}

		if (/^https?:\/\//i.test(background)) {
			if (!/^https:\/\//i.test(background) || background.length > 2048) {
				throw new BizError(t('invalidBackground'));
			}
		} else {

			let file;
			try {
				file = fileUtils.base64ToFile(background);
			} catch (e) {
				throw new BizError(t('invalidBackground'));
			}

			if (!BACKGROUND_TYPES.includes(file.type)) {
				throw new BizError(t('invalidBackground'));
			}

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);

			// 先写入新背景，成功后再删除旧背景，避免写入失败导致背景丢失
			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: fileUtils.contentDisposition('inline', file.name)
			});
		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);

		if (oldBackground && oldBackground !== background && !/^https?:\/\//i.test(oldBackground)) {
			try {
				await r2Service.delete(c, oldBackground);
			} catch (e) {
				console.warn('删除旧背景失败', e.message);
			}
		}

		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async websiteConfig(c) {

		// 公开接口：只读 KV 缓存的设置，仅在确实需要时才查询 D1 的 IP 校验记录
		const settingRow = await this.query(c);
		const token = await userContext.getToken(c);

		let regVerifyOpen = false;
		let addVerifyOpen = false;

		const needRegRecord = settingRow.register === settingConst.register.OPEN && settingRow.registerVerify === settingConst.registerVerify.COUNT;
		const needAddRecord = !!token && settingRow.addEmailVerify === settingConst.addEmailVerify.COUNT;

		if (needRegRecord || needAddRecord) {
			const recordList = await verifyRecordService.selectListByIP(c);
			recordList.forEach(row => {
				if (row.type === verifyRecordType.REG) {
					regVerifyOpen = row.count >= settingRow.regVerifyCount
				}
				if (row.type === verifyRecordType.ADD) {
					addVerifyOpen = row.count >= settingRow.addVerifyCount
				}
			});
		}

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			loginVerify: settingRow.loginVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			loginDarkenFactor: settingRow.loginDarkenFactor,
			domainList: settingRow.loginDomain === 1 && !token ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen,
			addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			githubClientId: settingRow.githubClientId,
			githubSwitch: settingRow.githubSwitch,
			googleClientId: settingRow.googleClientId,
			googleSwitch: settingRow.googleSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink,
			adminOnly: settingRow.adminOnly
		};
	},

};

export default settingService;
