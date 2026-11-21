import fileUtils from '../utils/file-utils';
import { isPublicObjKey } from '../utils/att-headers';

const kvObjService = {

	async putObj(c, key, content, metadata) {
		// 文件与系统数据共用 KV，只允许写入附件 / 静态资源前缀
		if (!isPublicObjKey(key)) {
			throw new Error('Invalid object key');
		}
		await c.env.kv.put(key, content, { metadata: metadata });
	},

	async deleteObj(c, keys) {

		if (typeof keys === 'string') {
			keys = [keys];
		}

		keys = keys.filter(isPublicObjKey);

		if (keys.length === 0) {
			return;
		}

		await Promise.all(keys.map( key => c.env.kv.delete(key)));
	},

	async getObj(c, key) {
		if (!isPublicObjKey(key)) {
			return null;
		}
		const obj = await c.env.kv.getWithMetadata(key, { type: "arrayBuffer"});
		if (!obj.value) {
			return null;
		}

		return new Response(obj.value, {
			headers: fileUtils.safeObjHeaders(obj.metadata?.contentType, obj.metadata?.contentDisposition, obj.metadata?.cacheControl)
		});
	},

	async toObjResp(c, key) {

		const resp = await this.getObj(c, key);
		return resp || new Response('Not Found', { status: 404 });

	}

};

export default kvObjService;
