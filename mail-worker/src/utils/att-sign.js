// 附件临时链接签名：附件不再允许匿名访问，页面拿到的是带过期时间和签名的地址。
// 设置环境变量 att_public = true 可恢复为公开访问。
const encoder = new TextEncoder();
// 链接有效期 24 小时，过期时间按小时取整，同一小时内生成的地址相同，便于浏览器缓存
const LINK_TTL = 24 * 3600;
const EXP_BUCKET = 3600;
// 邮件正文中的站内附件占位符
const PLACEHOLDER = /\{\{domain\}\}(attachments\/[^"'\s<>()?#\\]+)/g;

let keyCache = { secret: null, key: null };

async function signingKey(env) {
	const secret = env?.jwt_secret;
	if (!secret) {
		throw new Error('Missing jwt_secret for attachment links');
	}
	if (keyCache.secret === secret) {
		return keyCache.key;
	}
	const algorithm = { name: 'HMAC', hash: 'SHA-256' };
	const root = await crypto.subtle.importKey('raw', encoder.encode(String(secret)), algorithm, false, ['sign']);
	// 从部署密钥派生附件专用密钥，和登录、图片代理的签名互不通用
	const raw = await crypto.subtle.sign('HMAC', root, encoder.encode('cloud-mail/attachment/v1'));
	const key = await crypto.subtle.importKey('raw', raw, algorithm, false, ['sign', 'verify']);
	keyCache = { secret, key };
	return key;
}

function toBase64Url(buffer) {
	return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
		return null;
	}
	try {
		return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='), ch => ch.charCodeAt(0));
	} catch {
		return null;
	}
}

export function attAuthEnabled(env) {
	return !(env?.att_public === true || env?.att_public === 'true');
}

export function linkExpiry(now = Date.now()) {
	return Math.ceil((Math.floor(now / 1000) + LINK_TTL) / EXP_BUCKET) * EXP_BUCKET;
}

async function sign(env, key, exp) {
	const signature = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(`${key}\n${exp}`));
	return toBase64Url(signature);
}

// 生成附件访问地址（站内相对路径）
export async function attUrl(env, key, exp = linkExpiry()) {
	const path = '/' + String(key).split('/').map(encodeURIComponent).join('/');
	if (!attAuthEnabled(env)) {
		return path;
	}
	return `${path}?exp=${exp}&sig=${await sign(env, key, exp)}`;
}

export async function verifyAttLink(env, key, params) {
	const exp = params?.get?.('exp') || '';
	const signature = fromBase64Url(params?.get?.('sig'));
	if (!/^[1-9]\d{0,12}$/.test(exp) || Number(exp) <= Math.floor(Date.now() / 1000) || !signature) {
		return false;
	}
	return crypto.subtle.verify('HMAC', await signingKey(env), signature, encoder.encode(`${key}\n${exp}`));
}

// 是否允许访问该对象：非附件（如登录背景 static/）始终公开
export async function attAccessAllowed(env, key, params) {
	if (!String(key || '').startsWith('attachments/') || !attAuthEnabled(env)) {
		return true;
	}
	try {
		return await verifyAttLink(env, key, params);
	} catch {
		return false;
	}
}

// 把正文中的 {{domain}}attachments/xxx 换成签名地址。
// keepPlaceholder=true 时保留 {{domain}} 前缀只追加签名参数，供开放 API、Webhook 等仍自行替换域名的调用方使用。
export async function signAttContent(env, html, { keepPlaceholder = false } = {}) {
	if (typeof html !== 'string' || !html.includes('{{domain}}attachments/') || !attAuthEnabled(env)) {
		return html;
	}
	const keys = [...new Set([...html.matchAll(PLACEHOLDER)].map(match => match[1]))];
	const exp = linkExpiry();
	const signed = new Map(await Promise.all(keys.map(async key => [key, await sign(env, key, exp)])));
	return html.replace(PLACEHOLDER, (match, key) => {
		const query = `?exp=${exp}&amp;sig=${signed.get(key)}`;
		return keepPlaceholder ? `{{domain}}${key}${query}` : `${'/' + key.split('/').map(encodeURIComponent).join('/')}${query}`;
	});
}
