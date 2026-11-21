const domainUtils = {

	// 解析 env.domain（数组 / JSON 字符串 / 逗号分隔），统一转小写
	list(c) {
		let value = c?.env?.domain;
		if (typeof value === 'string') {
			try {
				value = JSON.parse(value);
			} catch {
				value = value.split(',');
			}
		}
		if (!Array.isArray(value)) {
			return [];
		}
		return value.map(item => String(item).trim().toLowerCase()).filter(Boolean);
	},

	// 精确判断邮箱是否属于本站域名（避免字符串 includes 的子串误判）
	isOwnDomain(c, email) {
		const value = String(email || '');
		const at = value.lastIndexOf('@');
		const domain = at > -1 ? value.slice(at + 1).trim().toLowerCase() : '';
		return !!domain && this.list(c).includes(domain);
	},

	toOssDomain(domain) {

		if (!domain) {
			return null
		}

		if (!domain.startsWith('http')) {
			return 'https://' + domain
		}

		if (domain.endsWith("/")) {
			domain = domain.slice(0, -1);
		}

		return domain
	}
}

export default  domainUtils
