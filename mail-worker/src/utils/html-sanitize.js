import { parseHTML } from 'linkedom';

// 服务端邮件 HTML 清洗（与前端 utils/email-html.js 规则一致）：
// 删除可执行/嵌入类标签与事件属性，只保留 http/https/mailto 链接和安全图片地址
const REMOVE_TAGS = 'script, iframe, frame, frameset, object, embed, applet, base, meta, link, form, input, button, textarea, select, option, svg, math, template, noscript, portal';
const REMOVE_ATTRS = ['srcdoc', 'srcset', 'action', 'formaction', 'autofocus', 'id', 'name', 'xmlns', 'background', 'ping', 'dynsrc', 'lowsrc'];

function safeUrl(value, kind) {
	const v = String(value || '').trim();
	if (/^cid:/i.test(v)) return kind === 'image';
	if (kind === 'image' && /^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(v)) return true;
	try {
		const url = new URL(v);
		if (['http:', 'https:'].includes(url.protocol)) return true;
		return kind === 'link' && url.protocol === 'mailto:';
	} catch {
		return false;
	}
}

export function sanitizeEmailHtml(html = '') {
	const { document } = parseHTML(`<!DOCTYPE html><html><head></head><body>${html || ''}</body></html>`);
	document.querySelectorAll(REMOVE_TAGS).forEach(node => node.remove());
	document.querySelectorAll('*').forEach(node => {
		for (const attribute of [...node.attributes]) {
			const name = attribute.name.toLowerCase();
			const value = String(attribute.value || '');
			if (name.startsWith('on') || REMOVE_ATTRS.includes(name)) {
				node.removeAttribute(attribute.name);
				continue;
			}
			if (name === 'style' && /expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:/i.test(value)) {
				node.removeAttribute(attribute.name);
			}
		}
		if (node.hasAttribute('href') && !safeUrl(node.getAttribute('href'), 'link')) {
			node.removeAttribute('href');
		}
		if (node.hasAttribute('src') && (node.tagName !== 'IMG' || !safeUrl(node.getAttribute('src'), 'image'))) {
			node.removeAttribute('src');
		}
		if (node.tagName === 'A') {
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer');
		}
	});
	document.querySelectorAll('style').forEach(style => {
		style.textContent = String(style.textContent || '').replace(/@import[^;]*;?/gi, '').replace(/expression\s*\(/gi, '');
	});
	return document.body ? document.body.innerHTML : '';
}

export function escapeHtml(text = '') {
	return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
