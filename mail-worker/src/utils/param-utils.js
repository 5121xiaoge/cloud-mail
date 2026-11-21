import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const paramUtils = {

	// 解析 "1,2,3" 或 [1,2,3] 为正整数数组，非法时抛出参数错误
	ids(value, max = 1000) {
		let list = value;
		if (typeof list === 'number') list = [list];
		if (typeof list === 'string') list = list.split(',');
		if (!Array.isArray(list)) throw new BizError(t('paramError'));
		const ids = [...new Set(list.map(item => Number(String(item).trim())))];
		if (ids.length === 0 || ids.length > max || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
			throw new BizError(t('paramError'));
		}
		return ids;
	},

	id(value) {
		return this.ids(value, 1)[0];
	},

	// D1 单条语句最多绑定 100 个参数，批量 IN 查询需要分批
	chunk(list, size = 90) {
		const result = [];
		for (let i = 0; i < list.length; i += size) {
			result.push(list.slice(i, i + size));
		}
		return result;
	},

	page(num, size, maxSize = 50, defSize = 20) {
		num = Number(num);
		size = Number(size);
		if (!Number.isSafeInteger(num) || num < 1) num = 1;
		if (!Number.isSafeInteger(size) || size < 1) size = defSize;
		size = Math.min(size, maxSize);
		return { size, offset: (num - 1) * size };
	}
};

export default paramUtils;
