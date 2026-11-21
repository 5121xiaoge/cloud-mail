import i18next from 'i18next';
import { AsyncLocalStorage } from 'node:async_hooks';
import zh from './zh.js'
import en from './en.js'
import app from '../hono/hono';

// 每个请求单独保存语言，避免并发请求之间互相覆盖（需要 compatibility_flags = ["nodejs_als"]）
const langStore = new AsyncLocalStorage();

function resolveLang(header) {
	const lang = String(header || '').split(',')[0].split('-')[0].trim().toLowerCase();
	return lang === 'en' ? 'en' : 'zh';
}

app.use('*', async (c, next) => {
	return langStore.run(resolveLang(c.req.header('accept-language')), () => next());
})

const resources = {
	en: {
		translation: en
	},
	zh: {
		translation: zh,
	},
};

i18next.init({
	lng: 'zh',
	fallbackLng: 'zh',
	resources,
	initImmediate: false,
});

export const t = (key, values) => i18next.t(key, { ...(values || {}), lng: langStore.getStore() || 'zh' })

export default i18next;
