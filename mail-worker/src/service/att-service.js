import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, desc } from 'drizzle-orm';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import { v4 as uuidv4 } from 'uuid';
import domainUtils from '../utils/domain-utils';
import settingService from "./setting-service";
import { sleep } from '../utils/time-utils';
import proxyService from './proxy-service';
import { isDangerousAttType } from '../utils/att-headers';
import paramUtils from '../utils/param-utils';
import { attUrl } from '../utils/att-sign';

const attService = {

	async addAtt(c, attachments) {

		for (let attachment of attachments) {

			let metadate = {
				contentType: isDangerousAttType(attachment.mimeType)
					? 'application/octet-stream'
					: attachment.mimeType,
			}

			// 仅安全图片允许内联展示，其余（HTML/SVG/脚本等）一律作为附件下载
			if (attachment.contentId && fileUtils.isInlineSafe(attachment.mimeType)) {
				metadate.contentDisposition = fileUtils.contentDisposition('inline', attachment.filename)
				metadate.cacheControl = `max-age=259200`
			} else {
				metadate.contentDisposition = fileUtils.contentDisposition('attachment', attachment.filename)
			}

			for (let attempt = 0; ; attempt++) {
				try {
					await r2Service.putObj(c, attachment.key, attachment.content, metadate);
					break;
				} catch (error) {
					if (attempt >= 2) throw error;
					await sleep(200 * (attempt + 1));
				}
			}

		}

		// D1 单条语句最多 100 个绑定参数，附件多时分批插入
		for (const rows of paramUtils.chunk(attachments, 5)) {
			await orm(c).insert(att).values(rows).run();
		}
	},

	async list(c, params, userId) {
		const { emailId } = params;

		const rows = await orm(c).select().from(att).where(
			and(
				eq(att.emailId, emailId),
				eq(att.userId, userId),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
		return this.withUrls(c, rows);
	},

	// 给附件记录加上签名访问地址
	async withUrls(c, rows) {
		await Promise.all((rows || []).map(async row => {
			row.url = await attUrl(c.env, row.key);
		}));
		return rows;
	},

	async toImageUrlHtml(c, content) {

		const { r2Domain } = await settingService.query(c);

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		let imageDataList = [];

		for (const img of images) {

			//邮件正文base64图片转cid附件
			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				const buff = await file.arrayBuffer();
				const cid = uuidv4().replace(/-/g, '');
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);

				img.setAttribute('src', 'cid:' + cid);

				const attData = {};
				attData.key = key;
				attData.filename = file.name;
				attData.mimeType = file.type;
				attData.size = file.size;
				attData.buff = buff;
				attData.content = fileUtils.base64ToDataStr(src);
				attData.contentId = cid;

				imageDataList.push(attData);
			}

			// TinyMCE 可能把路径收成 ../attachments 或 /attachments
			const proxyUrl = proxyService.fromProxyPath(src);
			if (proxyUrl) {
				img.setAttribute('src', proxyUrl);
			}

			const attKey = this.fromAttSrc(src);
			const ossDomain = domainUtils.toOssDomain(r2Domain);
			const fromOss = ossDomain && src && src.startsWith(ossDomain);

			//邮件正文站内图片转cid附件
			if (fromOss || attKey) {

				const cid = uuidv4().replace(/-/g, '')
				img.setAttribute('src', 'cid:' + cid);

				const attData = {};

				if (fromOss) {
					attData.key = src.replace(ossDomain + '/','');
				}

				if (attKey) {
					attData.key = attKey;
				}

				attData.contentId = cid;
				attData.type = attConst.type.EMBED;
				imageDataList.push(attData);

			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			const hasStyleWidth = /(^|\s)width\s*:\s*[^;]+/.test(style);

			if (!hasInlineWidth && !hasStyleWidth) {
				const newStyle = (style ? style.trim().replace(/;$/, '') + '; ' : '') + 'max-width: 100%;';
				img.setAttribute('style', newStyle);
			}
		}

		//查询已有内嵌url图片信息
		const keys = [...new Set(imageDataList.filter(item => !item.content).map(item => item.key))];
		const dbImageList  = await this.selectOneByKeys(c, keys);

		//设置给当前附件
		await Promise.all(imageDataList.map(async image => {
			if (image.content) {
				return;
			}

			const dbImage = dbImageList.find(dbImage => image.key === dbImage.key);
			if (!dbImage) {
				return;
			}

			image.size = dbImage.size;
			image.filename = dbImage.filename;
			image.mimeType = dbImage.mimeType;
			image.contentType = dbImage.mimeType;

			const obj = await r2Service.getObj(c, image.key);
			if (!obj) {
				return;
			}

			image.content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
		}))

		imageDataList = imageDataList.filter(image => image.content);

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId) {

		const attDataList = [];

		for (let att of attList) {
			att.buff = fileUtils.base64ToUint8Array(att.content);
			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData = { userId, accountId, emailId };
			attData.key = att.key;
			attData.size = att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.type;
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		for (const rows of paramUtils.chunk(attDataList, 5)) {
			await orm(c).insert(att).values(rows).run();
		}

		for (let att of attList) {
			await r2Service.putObj(c, att.key, att.buff, {
				contentType: att.type,
				contentDisposition: fileUtils.contentDisposition('attachment', att.filename)
			});
		}

	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId) {

		for (let attData of attDataList) {
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			if (!attData.buff) {
				continue;
			}
			await r2Service.putObj(c, attData.key, attData.buff, {
				contentType: attData.mimeType,
				cacheControl: `max-age=259200`,
				contentDisposition: fileUtils.contentDisposition(fileUtils.isInlineSafe(attData.mimeType) ? 'inline' : 'attachment', attData.filename)
			});
			delete attData.buff;
		}

		for (const rows of paramUtils.chunk(attDataList, 5)) {
			await orm(c).insert(att).values(rows).run();
		}

	},

	async removeByUserIds(c, userIds) {
		await this.removeAttByField(c, att.userId, userIds);
	},

	async removeByEmailIds(c, emailIds) {
		await this.removeAttByField(c, att.emailId, emailIds);
	},

	selectByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(
			and(
				inArray(att.emailId, emailIds),
				eq(att.type, attConst.type.ATT)
			))
			.all();
	},

	async removeAttByField(c, column, fieldValues) {

		const keys = new Set();

		// 分批查询并删除附件记录（D1 单条语句最多绑定 100 个参数）
		for (const values of paramUtils.chunk(fieldValues)) {
			const rows = await orm(c).select({ key: att.key }).from(att).where(inArray(column, values)).all();
			rows.forEach(row => keys.add(row.key));
			await orm(c).delete(att).where(inArray(column, values)).run();
		}

		// 同一文件可能被多封邮件引用（按内容哈希去重），只删除已没有任何引用的文件
		const keyList = [...keys];
		const stillUsed = new Set();
		for (const batch of paramUtils.chunk(keyList)) {
			const rows = await orm(c).select({ key: att.key }).from(att).where(inArray(att.key, batch)).all();
			rows.forEach(row => stillUsed.add(row.key));
		}

		const delKeyList = keyList.filter(key => !stillUsed.has(key));

		if (delKeyList.length > 0) {
			try {
				await this.batchDelete(c, delKeyList);
			} catch (e) {
				console.error('删除附件文件失败：', e);
			}
		}

	},

	async batchDelete(c, keys) {
		if (!keys.length) return;

		const BATCH_SIZE = 1000;

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			await r2Service.delete(c, batch);
		}

	},

	async removeByAccountId(c, accountId) {
		await this.removeAttByField(c, att.accountId, [accountId])
	},

	selectOneByKeys(c, keys) {
		if (!keys || keys.length === 0) {
			return []
		}
		return orm(c).select().from(att).where(inArray(att.key, keys)).orderBy(desc(att.attId)).groupBy(att.key).all();
	},

	// attachments/、/attachments/、../attachments/ 都收成存储 key。
	fromAttSrc(src) {
		if (!src) {
			return null;
		}
		const marker = 'attachments/';
		const value = String(src);
		const idx = value.indexOf(marker);
		if (idx === -1) {
			return null;
		}
		// 去掉签名参数（?exp=&sig=）和锚点，只保留存储 key
		let key = value.slice(idx).split(/[?#]/)[0];
		try {
			key = decodeURIComponent(key);
		} catch {
			// 保留原值
		}
		return key;
	}
};

export default attService;
