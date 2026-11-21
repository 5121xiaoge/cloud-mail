import domainUtils from '../utils/domain-uitls';
import { sanitizeEmailHtml } from '../utils/html-sanitize';

// Telegram 中查看邮件的页面：服务端清洗后直接输出，页面不含任何脚本（配合 CSP script-src 'none'）
export default function emailHtmlTemplate(html, domain) {

	let content = sanitizeEmailHtml(html || '');
	content = content.replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');

	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <style>
        html { background: #FFF; color-scheme: light; }
        body {
            box-sizing: border-box;
            margin: 0;
            padding: 15px 10px;
            overflow-x: auto;
            font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #13181D;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        h1, h2, h3, h4 { font-size: 18px; font-weight: 700; }
        a { text-decoration: none; color: #0E70DF; }
        img:not(table img) { max-width: 100% !important; height: auto !important; }
        pre { white-space: pre-wrap; }
    </style>
</head>
<body>
${content}
</body>
</html>`
}
