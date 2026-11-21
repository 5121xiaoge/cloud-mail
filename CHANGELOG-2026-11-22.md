# 改动说明（2026-11-22）

对比基准：`_backup_20261122`（三轮修改之前的版本）。共涉及 **61 个文件**：新增 5 个，重命名 3 个，修改 53 个。

---

## 一、部署前必读

### 会影响现有行为的改动

| 改动 | 影响 | 怎么处理 |
|---|---|---|
| 附件需要签名才能访问 | 以前收藏或分享出去的附件直链会打不开（403） | 想恢复公开访问，在 `[vars]` 里设 `att_public = true` |
| 开放 API 和 Webhook 返回的正文 | 仍保留 `{{domain}}` 占位符，但附件地址后面多了 `?exp=…&sig=…`，24 小时后失效 | 调用方不用改代码；如果长期保存正文，需要在 24 小时内转存附件 |
| 系统设置里的密钥 | Webhook 密钥和 OAuth Secret 现在显示为遮掩值（如 `ab******`） | 不改就保持原值，要换就直接填新值 |
| 站内群发 | 收件人加抄送、密送超过 50 个会被拒绝 | — |
| 批量删除 | 只填通配符（比如 `%`）会报参数错误 | — |
| 密码长度上限 | 从 30 位放宽到 128 位 | — |
| 邮件列表接口 | 翻页时（`emailId` 不为 0）`total` 返回 `null`，也不再返回 `latestEmail` | 前端只在首页用这两个值，已核对 |

### 部署步骤
1. 跑一遍测试：`cd mail-vue && pnpm i && pnpm test:unit`
2. 部署 Worker，再访问一次 `/api/init/<密钥>`，补建 5 个索引和 `email.list_text` 字段。没来得及访问也没关系，第一次请求或收信时会自动补上这个字段。
3. 建议：`jwt_secret` 和 `linuxdo_client_secret` 用 `wrangler secret put` 存成加密密钥，不要写在 `[vars]` 里。另外单独设置一个 `init_secret`，初始化完成后设 `init_disabled = true`。

---

## 二、按主题说明

### 1. 安全修复

**未登录可以读取 KV 里的全部系统数据（严重）**
- 新增 `isPublicObjKey`：对象路径只允许 `attachments/` 和 `static/` 开头，并拒绝 `..`、反斜杠和绝对路径。路径解码前和解码后都会检查。
- `/oss/`、`/api/oss/`、`/attachments/`、`/static/` 四个入口都加了校验，KV 的读、写、删在底层也做了同样的限制。
- 文件：`utils/att-headers.js`、`index.js`、`api/r2-api.js`、`service/kv-obj-service.js`

**附件不登录也能下载**
- 新增 `utils/att-sign.js`：附件链接带 HMAC 签名，24 小时有效，过期时间按整点取，同一小时内地址相同，方便浏览器缓存。签名密钥从 `jwt_secret` 派生，和登录、图片代理的签名互不通用。
- 附件列表接口新增 `url` 字段。邮件列表、详情、星标、全部邮件、Telegram 预览里的正文，站内附件都换成签名地址；开放 API 和 Webhook 保留 `{{domain}}` 占位符，只在后面追加签名参数。
- 回复或转发时，引用正文里的签名参数会被去掉，再按原来的方式作为附件发出去。
- 文件：`utils/att-sign.js`（新增）、`index.js`、`api/r2-api.js`、`service/att-service.js`、`service/email-service.js`、`service/star-service.js`、`service/telegram-service.js`、`service/webhook-service.js`、`service/public-service.js`、`views/content/index.vue`、`wrangler.toml`

**系统公告存储型 XSS**
- 后端保存公告前清洗 HTML，前端显示时再用 DOMPurify 清洗一次。公告宽度强制转成数字，样式节点改为复用，不再每次新建。
- 文件：`service/setting-service.js`、`layout/main/index.vue`

**转发邮件时可以注入邮件头**
- 发件人名、地址、主题、Content-Type、Content-ID、Message-ID 都会去掉换行符。收件人地址也会校验，之前只校验了抄送和密送。
- 文件：`utils/forward-mime.js`、`service/email-service.js`

**设置接口泄露密钥**
- 所有密钥统一遮掩，新增遮掩 Webhook 密钥和三个 OAuth Secret。保存时如果传回的还是遮掩后的值，会被忽略，不会把真实密钥覆盖掉。
- 文件：`service/setting-service.js`

**权限与校验**
- 域名改为精确匹配，不会再出现 `x@a.co` 通过 `a.com` 校验的情况。支持数组、JSON、逗号分隔三种配置写法。
- 管理员判断统一为不区分大小写。
- 回复邮件时会校验这封邮件是不是你的。
- 角色接口只允许写入白名单字段，`banEmail`、`permIds` 不是数组时不再报 500。
- 登录令牌和 Telegram 查看链接加了 `purpose` 用途标记，不能拿一种冒充另一种。旧令牌没有这个标记，照常可用。
- 文件：`utils/domain-utils.js`、`service/account-service.js`、`service/login-service.js`、`service/user-service.js`、`service/public-service.js`、`service/role-service.js`、`security/security.js`、`websocket/auth.js`、`service/telegram-service.js`

### 2. 可靠性与逻辑修复

- **D1 每条 SQL 最多绑定 100 个参数**：删除邮件、标记已读、删除附件和收藏都改成每批最多 90 个；附件插入每批 5 条。新增 `paramUtils.chunk`。
- **发送配额并发绕过**：改成原子预占额度，发送失败的部分会自动退回（`userService.reserveSendCount`）。
- **收信健壮性**：没有 From 的邮件不再崩溃；超过 1 天还卡在"保存中"的邮件，由定时任务自动清理。
- **附件清理**：不再每个值做一次全表 GROUP BY；同一文件被多封邮件引用时，只删除已经没有任何引用的文件。删除邮件、用户、账号时会连带删除收藏记录。
- **批量删除**：只填通配符时直接拒绝。
- **Bug 修复**：
  - Telegram 预览图里的 `null/` 地址
  - 注册验证计数第一次不生效（`.run()` 改为 `.get()`）
  - LinuxDo 的 `silenced` 字段算错
  - 黑名单、转发邮箱、TG Chat ID 拆分后没去掉空格
- **转发绑定缺失**：没配置 `forward` 绑定时，站内邮件转发会跳过并在日志里给出提示。
- **绑定缺失提示**：D1 或 KV 没绑定时直接返回明确提示，不再靠匹配异常文字来判断。
- **前端请求地址**：axios 在没配置 `VITE_BASE_URL` 时默认用 `/api`；新增 `.env.release`。

### 3. 实时连接（WebSocket）

- 每条连接按用户、会话打标签，会话失效时只断开对应的连接。
- 这些操作会断开连接，客户端收到后不再重连（关闭码 4401）：
  - 退出登录
  - 超过 10 个会话时，最早的那个被挤掉
  - 自己改密码（断开其他设备）
  - 管理员重置密码、封禁、删除用户
  - 用户注销账号
  - 单管理员模式下清理普通用户
- 修改用户角色时，连接断开后会自动重连并重新鉴权（关闭码 4000）。
- 新版本上线前就已经建立的连接没有标签，要等它们重连一次才能生效。
- 文件：`websocket/hub.js`、`websocket/auth.js`、`websocket/connect.js`、`websocket/notify.js`、`service/login-service.js`、`service/user-service.js`、`security/security.js`

### 4. 性能

- **列表摘要入库**：新增 `email.list_text` 字段，收信和发信时直接算好摘要。列表加载时不再读正文、不再解析 HTML，老邮件仍按原方式现算。
- **图片代理预判**：正文里没有外链图片时，跳过 HTML 解析。
- **翻页**：不再统计总数、不再查最新游标，每页少两次查询。
- **密钥缓存**：JWT、图片代理、附件签名的密钥都改成缓存，不再每次请求重新导入。
- **后台推送**：收信后的 TG 和 Webhook 推送改到后台执行（`ctx.waitUntil`）；Webhook 重试之间递增等待，重试次数最多 5 次。
- **新增索引**：`attachments(key)`、`attachments(user_id)`、`attachments(account_id)`、`email(account_id)`、`email(resend_email_id)`。
- 文件：`entity/email.js`、`lib/email-list-columns.js`、`service/email-service.js`、`service/star-service.js`、`service/proxy-service.js`、`utils/jwt-utils.js`、`email/email.js`、`service/webhook-service.js`、`init/init.js`、`service/email-delivery-service.js`、`hono/hono.js`

### 5. 前端界面

**主题切换圆形揭幕动画**
- 新增 `utils/theme-transition.js`，顶栏、登录页、设置页的主题卡片三处统一使用。
- 圆心：鼠标点击时取点击位置，键盘或单选框触发时取元素中心。时长 520ms，ease-out；最大半径为圆心到屏幕最远角的距离加 10px。
- 动画方式：用 View Transitions API 实现，由 CSS `@keyframes` 驱动 `clip-path`，并按切换方向调整新旧两层的 `z-index`。
- 动画期间加上 `html.theme-switching`，关闭页面上的颜色过渡，结束后延迟 80ms 再恢复。
- 降级：开启"减少动态效果"或页面在后台时直接切换；不支持 View Transitions 时用 `transform: scale` 色块动画；连 Web Animations 也不支持时直接切换。
- 动画中再次点击：方向按最近一次点击的目标主题判断，上一次动画会被正常收尾。
- 修复：原来 CSS 里的 `--vt-duration` 从来没定义过，动画一直没生效；原来切换时直接替换 `html` 的整个 class，现在只增删 `dark`；顶栏原来是两个按钮轮流显示，现在合并成一个，用键盘切换时焦点不会丢。
- 文件：`utils/theme-transition.js`（新增）、`style.css`、`layout/header/index.vue`、`views/login/index.vue`、`components/theme-selector/index.vue`

**搜索按钮对齐**
- 手机端搜索按钮改为 44×44，和主题、公告按钮一致。原来容器只有 32px 高，按钮被全局样式撑到 44px 后错位。
- 文件：`components/email-search/index.vue`

### 6. 代码整理

- 改了 3 个拼错的文件名：`domain-uitls.js` → `domain-utils.js`，`date-uitil.js` → `date-util.js`，`request/ouath.js` → `request/oauth.js`。引用已全部同步。
- 改了几个拼错的标识符：`isExistRegKye` → `isExistRegKey`（含中英文语言包），`clearNoBindOathUser` → `clearNoBindOauthUser`，`premKey` → `permKeyRoutes`。
- 删除空方法 `registerVerify` 和没用到的变量。
- 字段类型修正：`user.sort`、`user.send_count` 改为 integer，`verify_record.ip` 改为 text。
- 附件的安全响应头统一由 `att-headers.js` 提供，`file-utils.js` 改为复用，原来两份规则不一致。

### 7. 测试

- 新增 `tests/worker-security.test.js`：覆盖存储路径白名单、域名精确匹配、转发邮件头注入、附件签名的生成与过期、正文占位符替换。
- `tests/worker-harness.js`：补上 `adminMode`、`paramUtils` 依赖。
- `tests/upgrade-compatibility.test.js`：升级步骤加上 `v3_7DB`。
- `tests/mailbox-selection.test.js`：补上 `adminMode` 依赖（验证时你改的）。

---

## 三、文件清单

**新增**
```
mail-vue/.env.release
mail-vue/src/utils/theme-transition.js
mail-vue/tests/worker-security.test.js
mail-worker/src/utils/att-sign.js
```

**重命名**
```
mail-worker/src/utils/domain-uitls.js  →  domain-utils.js
mail-worker/src/utils/date-uitil.js    →  date-util.js
mail-vue/src/request/ouath.js          →  oauth.js
```

**修改：后端 `mail-worker/`**
```
wrangler.toml
src/index.js                       src/hono/hono.js
src/api/r2-api.js                  src/email/email.js
src/entity/email.js                src/entity/user.js
src/entity/verify-record.js        src/init/init.js
src/i18n/zh.js                     src/i18n/en.js
src/lib/email-list-columns.js      src/security/security.js
src/service/account-service.js     src/service/analysis-service.js
src/service/att-service.js         src/service/email-delivery-service.js
src/service/email-service.js       src/service/kv-obj-service.js
src/service/login-service.js       src/service/oauth-service.js
src/service/proxy-service.js       src/service/public-service.js
src/service/reg-key-service.js     src/service/role-service.js
src/service/s3-service.js          src/service/setting-service.js
src/service/star-service.js        src/service/telegram-service.js
src/service/user-service.js        src/service/verify-record-service.js
src/service/webhook-service.js     src/template/email-html.js
src/utils/att-headers.js           src/utils/file-utils.js
src/utils/forward-mime.js          src/utils/jwt-utils.js
src/utils/param-utils.js           src/websocket/auth.js
src/websocket/connect.js           src/websocket/hub.js
src/websocket/notify.js
```

**修改：前端 `mail-vue/`**
```
src/axios/index.js                 src/style.css
src/components/email-search/index.vue
src/components/theme-selector/index.vue
src/layout/header/index.vue        src/layout/main/index.vue
src/views/content/index.vue        src/views/login/index.vue
tests/mailbox-selection.test.js    tests/upgrade-compatibility.test.js
tests/worker-harness.js
```

---

## 四、提交建议

`email-service.js`、`user-service.js`、`att-service.js`、`index.js` 这几个文件同时涉及多个主题，按主题拆成多个提交需要用 `git add -p`。建议直接合成一个提交：

> 注意：当前 `cloud-mail` 文件夹里没有 `.git`，下面的命令要在你实际的 Git 仓库目录里执行。

```
git add -A mail-worker mail-vue CHANGELOG-2026-11-22.md
git commit -F- <<'EOF'
fix: 安全加固、附件签名访问、实时会话失效与列表性能优化

安全
- 对象存储路径白名单，修复未登录可读取 KV 系统数据的问题
- 附件改为 24 小时签名链接访问（att_public=true 可恢复公开）
- 修复公告存储型 XSS、转发邮件头注入、设置接口泄露密钥
- 域名精确匹配；管理员判断不区分大小写；角色字段白名单；JWT 增加 purpose

可靠性
- 批量操作按 D1 参数上限分批；发送额度原子预占
- 收信容错无 From 邮件；清理卡在保存中的邮件；附件按引用清理

实时连接
- WebSocket 按会话打标签，退出、改密、封禁、删除时断开对应连接

性能
- 新增 email.list_text 摘要入库；翻页不再统计总数
- 图片代理无外链时跳过解析；密钥缓存；推送改为后台执行；新增 5 个索引

前端
- 主题切换圆形揭幕动画（View Transitions，带降级）
- 修复手机端搜索按钮与工具栏不对齐

整理
- 修正拼错的文件名与标识符，统一响应头实现，修正实体字段类型
- 新增 worker-security 测试

BREAKING: 旧附件直链需要签名；翻页接口不再返回 total/latestEmail
EOF
```

> 备份目录 `_backup_20261122` 不要提交。可以确认没问题后删掉，或者加进 `.gitignore`。

---

## 五、验证清单

- [ ] `pnpm test:unit` 全部通过
- [ ] 访问 `/api/init/<密钥>` 返回 success
- [ ] 带附件和内嵌图片的邮件：图片显示、预览、下载都正常
- [ ] 把附件链接去掉 `?exp=…&sig=…` 后打开，返回 403
- [ ] 访问 `/oss/setting:` 返回 404
- [ ] 回复一封带内嵌图片的邮件，收件方能收到图片
- [ ] 邮件列表往下翻几页，摘要显示和加载正常
- [ ] 系统设置里改一个开关并保存，密钥没有被清空
- [ ] 两个设备登录同一账号，一个退出后另一个推送正常；改密码后其他设备立即断开
- [ ] 主题切换：鼠标点击、键盘切换、快速连点、开启"减少动态效果"都表现正常
- [ ] 手机端搜索图标和主题图标在同一水平线上
