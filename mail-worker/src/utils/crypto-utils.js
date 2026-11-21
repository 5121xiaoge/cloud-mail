const encoder = new TextEncoder();

// 新格式: pbkdf2$<iterations>$<base64Hash>；旧格式: base64(SHA-256(salt + password))，登录成功后自动升级
const PBKDF2_PREFIX = 'pbkdf2$';
// Cloudflare Workers 的 PBKDF2 迭代次数上限为 100000
const MAX_ITERATIONS = 100000;
// 默认值兼顾免费套餐 CPU 时间限制，可通过环境变量 pwd_iterations 调高（付费套餐建议 100000）
const DEFAULT_ITERATIONS = 10000;

const toBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

function resolveIterations(c) {
	const iterations = Number(c?.env?.pwd_iterations);
	if (Number.isInteger(iterations) && iterations >= 1000) {
		return Math.min(iterations, MAX_ITERATIONS);
	}
	return DEFAULT_ITERATIONS;
}

function parsePbkdf2(storedHash) {
	if (typeof storedHash !== 'string' || !storedHash.startsWith(PBKDF2_PREFIX)) return null;
	const [, iterationsStr, hash] = storedHash.split('$');
	const iterations = Number(iterationsStr);
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS || !hash) return null;
	return { iterations, hash };
}

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},

	async hashPassword(password, c) {
		const salt = this.generateSalt();
		const iterations = resolveIterations(c);
		const hash = await this.pbkdf2(password, salt, iterations);
		return { salt, hash: `${PBKDF2_PREFIX}${iterations}$${hash}` };
	},

	async pbkdf2(password, salt, iterations) {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(String(password || ' ')),
			'PBKDF2',
			false,
			['deriveBits']
		);
		const bits = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(String(salt)), iterations },
			keyMaterial,
			256
		);
		return toBase64(bits);
	},

	// 旧版哈希算法，仅用于校验历史数据
	async genHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return toBase64(hashBuffer);
	},

	needsRehash(storedHash, c) {
		const parsed = parsePbkdf2(storedHash);
		return !parsed || parsed.iterations < resolveIterations(c);
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (typeof inputPassword !== 'string' || !inputPassword || typeof storedHash !== 'string' || !storedHash) {
			return false;
		}

		const parsed = parsePbkdf2(storedHash);

		if (parsed) {
			const hash = await this.pbkdf2(inputPassword, salt, parsed.iterations);
			return this.safeEqual(hash, parsed.hash);
		}

		if (storedHash.startsWith(PBKDF2_PREFIX)) {
			return false;
		}

		const hash = await this.genHashPassword(inputPassword, salt);
		return this.safeEqual(hash, storedHash);
	},

	// 账号不存在时执行一次等价计算，避免通过响应时间枚举账号
	async dummyVerify(inputPassword, c) {
		await this.pbkdf2(inputPassword, 'cloud-mail-dummy-salt', resolveIterations(c));
		return false;
	},

	// 常量时间字符串比较
	safeEqual(a, b) {
		if (typeof a !== 'string' || typeof b !== 'string') return false;
		let diff = a.length ^ b.length;
		const len = b.length || 1;
		for (let i = 0; i < a.length; i++) {
			diff |= a.charCodeAt(i) ^ b.charCodeAt(i % len);
		}
		return diff === 0;
	},

	genRandomPwd(length = 12) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const values = new Uint32Array(length);
		crypto.getRandomValues(values);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(values[i] % chars.length);
		}
		return result;
	}
};

export default saltHashUtils;
