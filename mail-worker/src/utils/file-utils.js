// 允许在浏览器中直接内联打开的类型（不含 SVG / HTML 等可执行脚本的类型）
const INLINE_SAFE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif', 'image/x-icon', 'image/vnd.microsoft.icon'];

const fileUtils = {

	isInlineSafe(contentType) {
		const type = String(contentType || '').split(';')[0].trim().toLowerCase();
		return INLINE_SAFE_TYPES.includes(type);
	},

	// 生成符合 RFC 6266 / 5987 的 Content-Disposition，文件名含中文、空格、分号时不会破坏响应头
	contentDisposition(type, filename) {
		const name = String(filename || 'file').replace(/[\r\n"\\]/g, '_').slice(0, 200);
		const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/[;%]/g, '_') || 'file';
		return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
	},

	// 输出存储对象时统一使用的安全响应头：非图片一律下载，禁止嗅探，禁止脚本执行
	safeObjHeaders(contentType, contentDisposition, cacheControl) {
		const type = contentType || 'application/octet-stream';
		let disposition = contentDisposition || '';
		if (!this.isInlineSafe(type)) {
			disposition = /^\s*inline/i.test(disposition) ? disposition.replace(/^\s*inline/i, 'attachment') : (disposition || 'attachment');
			if (!/^\s*attachment/i.test(disposition)) disposition = 'attachment';
		}
		const headers = {
			'Content-Type': type,
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
			'Cross-Origin-Resource-Policy': 'cross-origin'
		};
		if (disposition) headers['Content-Disposition'] = disposition;
		if (cacheControl) headers['Cache-Control'] = cacheControl;
		return headers;
	},
	getExtFileName(filename) {
		try {
			const index = filename.lastIndexOf('.');
			return index !== -1 ? filename.slice(index) : '';
		} catch (e) {
			return ''
		}
	},

	async getBuffHash(buff) {
		const hashBuffer = await crypto.subtle.digest('SHA-256', buff);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	base64ToDataStr(base64) {
		return base64.split(',')[1] || base64;
	},

	base64ToUint8Array(base64) {
		const binaryStr = atob(base64);
		const len = binaryStr.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryStr.charCodeAt(i);
		}
		return bytes;
	},

	/**
	 * 将 Base64 数据转换为 File 对象（自动识别 MIME 类型和文件扩展名）
	 * @param {string} base64Data 带有 data: 前缀的 base64 数据
	 * @param {string} [customFilename] 可选，传入自定义文件名（不含扩展名）
	 * @returns {File} File 对象
	 */
	base64ToFile(base64Data, customFilename) {
		const match = typeof base64Data === 'string' && base64Data.match(/^data:(image|jpeg|video)\/([a-zA-Z0-9.+-]+);base64,/);
		if (!match) {
			throw new Error('Invalid base64 data format');
		}

		const type = match[1]; // image 或 video
		const ext = match[2];  // jpg, png, mp4 等
		const mimeType = `${type}/${ext}`;
		const cleanBase64 = base64Data.replace(/^data:(image|jpeg|video)\/[a-zA-Z0-9.+-]+;base64,/, '');

		const byteCharacters = atob(cleanBase64);
		const byteArrays = [];

		for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
			const slice = byteCharacters.slice(offset, offset + 1024);
			const byteNumbers = new Array(slice.length);
			for (let i = 0; i < slice.length; i++) {
				byteNumbers[i] = slice.charCodeAt(i);
			}
			byteArrays.push(new Uint8Array(byteNumbers));
		}

		const blob = new Blob(byteArrays, { type: mimeType });

		const filename = `${customFilename || `${type}_${Date.now()}`}.${ext}`;
		return new File([blob], filename, { type: mimeType });
	}
};


export default fileUtils;

