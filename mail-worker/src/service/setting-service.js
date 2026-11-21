import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import adminMode from '../security/admin-mode';
import { settingConst } from '../const/entity-const';

// 允许通过 /setting/set 修改的字段（与 setting 表一致），其余字段一律忽略
const SETTABLE_FIELDS = Object.keys(setting).filter(key => key !== 'background' && setting[key] && typeof setting[key] === 'object' && 'columnType' in setting[key]);

// 背景图只允许常见位图，禁止 SVG 等可执行内容
const BACKGROUND_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif'];

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
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


		let linuxdoSwitch = c.env.linuxdo_switch;
		let projectLink = c.env.project_link;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true
		} else {
			linuxdoSwitch = false
		}

		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;

		setting.adminOnly = adminMode.isAdminOnly(c);

		if (setting.adminOnly) {
			// 超级管理员单用户模式：强制关闭注册与第三方登录
			setting.register = settingConst.register.CLOSE;
			linuxdoSwitch = false;
		}

		setting.linuxdoClientId = linuxdoSwitch ? c.env.linuxdo_client_id : '';
		setting.linuxdoCallbackUrl = linuxdoSwitch ? c.env.linuxdo_callback_url : '';
		setting.linuxdoSwitch = linuxdoSwitch;

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

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
		if (settingData.adminOnly) {
			params.register = settingConst.register.CLOSE;
		}
		let resendTokens = { ...settingData.resendTokens, ...(input?.resendTokens || {}) };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		if (params.loginDarkenFactor !== undefined) {
			const factor = Number(params.loginDarkenFactor);
			params.loginDarkenFactor = Number.isNaN(factor) ? 0 : Math.min(1, Math.max(0, factor));
		}

		params.resendTokens = JSON.stringify(resendTokens);
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
			linuxdoCallbackUrl: settingRow.linuxdoCallbackUrl,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink,
			adminOnly: settingRow.adminOnly
		};
	},

};

export default settingService;
