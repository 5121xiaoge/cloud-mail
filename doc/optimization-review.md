# Cloud Mail 审查与优化记录

基于 GitHub 下载的 `cloud-mail-main.zip`（原始压缩包保留未动，可随时对比/回滚）。

## 一、已修复的问题

### 高危
| # | 问题 | 位置 | 处理 |
|---|------|------|------|
| 1 | 密码使用单次 SHA-256 加盐，易被离线暴力破解 | `utils/crypto-utils.js` | 改为 PBKDF2-SHA256（默认 10000 次，可用 `pwd_iterations` 调到 100000）；旧哈希仍可登录，登录成功后自动升级，无需迁移 |
| 2 | `/oauth/bindUser` 无需认证，只要知道 LinuxDo 用户 ID 即可抢绑，并绕过“关闭注册/人机验证” | `service/oauth-service.js` | LinuxDo 授权后签发 30 分钟有效的绑定凭证 `bindToken`，绑定必须携带；同时校验 LinuxDo 开关、修复未 await 的更新 |
| 3 | `/public/addUser` 用字符串拼接 SQL，User-Agent 等请求头可注入 | `service/public-service.js` | 改为参数化 `bind()` |
| 4 | 登录无防暴力破解 | 新增 `security/login-guard.js` | 同 IP+邮箱 15 分钟内失败 5 次、同 IP 失败 30 次即锁定 15 分钟 |

### 中危
- 登录时“用户不存在 / 密码错误”提示不同，可枚举账号 → 统一为“邮箱或密码错误”，并对不存在账号做等价耗时计算。
- 退出登录 `getToken` 未 await，会误删**另一个设备**的会话 → 修复，并保留 KV 过期时间。
- KV 会话中保存了密码哈希和盐 → 已剔除。
- 登录 JWT 永不过期 → 增加 30 天有效期（与 KV 会话一致）。
- JWT 未校验 `alg`、`jwt_secret` 未配置时报错不明确 → 已处理。
- 未知异常把内部错误信息直接返回前端 → 改为通用提示（调试可设 `expose_error = true`），详情看 Workers 日志。
- 免认证白名单用 `startsWith` 前缀匹配（如 `/loginXxx` 也会放行）→ 改为精确/按路径段匹配。
- Public Token 比较改为常量时间，且 KV 未生成 Token 时直接拒绝。
- Telegram 邮件查看链接可接受登录 JWT → 只接受携带 `emailId` 的专用令牌。
- Resend Webhook 可被伪造 → 配置 `resend_webhook_secret` 后校验 Svix 签名。

### 逻辑缺陷
- `resetPassword` 中 `password < 6`（字符串与数字比较），最短长度校验失效 → 修复并加最大长度。
- 管理员添加用户时 `roleService.selectById` 未 await，角色校验永远通过 → 修复。
- 参数类型未校验导致 500（如密码缺失时 `.length` 报错）→ 增加校验。
- 附件/对象不存在时返回空响应 → 返回 404。
- 随机密码使用 `Math.random` → 改为 `crypto.getRandomValues`。

### 新增可选配置（`wrangler.toml` 中已加注释）
`pwd_iterations`、`resend_webhook_secret`、`cors_origin`、`expose_error`。不配置时与原行为一致。

### 前端
- 登录页按企业级风格重做（见下）。
- `public/_headers` 增加 `X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Permissions-Policy`。
- API 响应增加 `nosniff` 与 `Referrer-Policy` 头。

## 二、登录页重做

- 桌面端左右分栏：左侧品牌区（渐变 + 动态光晕 + 网格纹理、站点名、价值主张、三条能力介绍、安全标识），右侧认证区。
- 移动端自动切换为居中卡片。
- 登录/注册使用分段 Tab 切换；支持回车提交、显示/隐藏密码、大写锁定提示、注册密码强度条。
- 规范 `autocomplete`（username / current-password / new-password），浏览器与密码管理器可正常填充；字段带 label，键盘与读屏友好。
- 右上角可切换中/英文与深色模式。
- 记住上次选择的邮箱域名；输入完整邮箱（含 @）时不再重复拼接后缀。
- 兼容原有后台设置：自定义背景图、遮罩深度、登录框透明度、隐藏域名、注册码、Turnstile 人机验证、LinuxDo 登录与绑定、项目链接开关。
- 登录失败自动清空密码并聚焦；去除调试日志；所有硬编码中文改为 i18n。

## 三、建议后续处理（未改动，影响面较大）

1. Token 存在 `localStorage`，一旦出现 XSS 可被窃取；可考虑改为 HttpOnly Cookie。
2. “个人设置 → 修改密码”不校验旧密码，建议增加。
3. `i18n` 中间件每个请求都调用 `i18next.init`，并发请求可能串语言。
4. 未配置 CSP（TinyMCE 与内联脚本需要单独调整后再加）。
5. `public/addUser` 批量导入时 PBKDF2 计算量随人数增加，免费套餐大批量导入可能超出 CPU 限制，建议分批。
6. `wrangler.toml` 中包含真实的 D1/KV ID，公开仓库前请移除。

## 四、部署说明

- 无需数据库迁移，无需重新初始化。
- 旧用户首次登录后密码哈希自动升级；已登录会话继续有效。
- 已升级为 PBKDF2 的账号无法再被旧版本代码校验，回滚到旧版本前请注意。
