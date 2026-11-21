<template>
  <div class="login-page" :class="{ 'has-custom-bg': hasCustomBg }" :style="pageStyle">

    <!-- 品牌展示区（桌面端） -->
    <aside class="brand-panel" :class="{ custom: hasCustomBg }">
      <!-- 企业级动态背景：极光光晕 + 点阵 + 透视网格 + 全球投递网络 + 扫光 + 噪点质感 -->
      <div class="brand-decor" aria-hidden="true" v-if="!hasCustomBg">
        <span class="bg-aurora a1"></span>
        <span class="bg-aurora a2"></span>
        <span class="bg-aurora a3"></span>
        <span class="bg-dots"></span>
        <span class="bg-floor"></span>
        <span class="bg-beam"></span>
        <svg class="bg-network" viewBox="0 0 800 800" fill="none" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="cm-core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stop-color="#5b8cff" stop-opacity=".55"/>
              <stop offset="1" stop-color="#5b8cff" stop-opacity="0"/>
            </radialGradient>
            <filter id="cm-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2.4" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <circle class="ring" cx="400" cy="400" r="370"/>
          <circle class="ring dash" cx="400" cy="400" r="300"/>
          <circle class="ring" cx="400" cy="400" r="220"/>
          <circle class="ring dash" cx="400" cy="400" r="140"/>
          <g class="orbits">
            <ellipse class="orbit" cx="400" cy="400" rx="370" ry="118" transform="rotate(-24 400 400)"/>
            <ellipse class="orbit" cx="400" cy="400" rx="300" ry="92" transform="rotate(34 400 400)"/>
            <circle class="sat" cx="738" cy="250" r="3.2" filter="url(#cm-glow)"/>
            <circle class="sat" cx="151" cy="232" r="2.6" filter="url(#cm-glow)"/>
          </g>
          <path class="link" d="M140 250Q330 180 510 210"/>
          <path class="link" d="M510 210Q640 230 682 297"/>
          <path class="link" d="M193 475Q300 600 348 695"/>
          <path class="link" d="M279 330Q420 300 532 448"/>
          <path class="link" d="M532 448Q560 500 568 541"/>
          <path class="link" d="M140 250Q200 380 193 475"/>
          <path class="link" d="M682 297Q640 440 568 541"/>
          <path class="pkt d1" pathLength="100" d="M140 250Q330 180 510 210"/>
          <path class="pkt d2" pathLength="100" d="M279 330Q420 300 532 448"/>
          <path class="pkt d3" pathLength="100" d="M193 475Q300 600 348 695"/>
          <path class="pkt d4" pathLength="100" d="M682 297Q640 440 568 541"/>
          <path class="pkt d5" pathLength="100" d="M140 250Q200 380 193 475"/>
          <circle cx="400" cy="400" r="130" fill="url(#cm-core-glow)"/>
          <g class="core">
            <rect class="core-box" x="356" y="356" width="88" height="88" rx="22"/>
            <path class="core-icon" d="M378 386h44a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4h-44a4 4 0 0 1-4-4v-28a4 4 0 0 1 4-4ZM376 390l24 17 24-17"/>
          </g>
          <circle class="halo h1" cx="510" cy="210" r="9"/>
          <circle class="node" cx="510" cy="210" r="3.6" filter="url(#cm-glow)"/>
          <circle class="halo h2" cx="193" cy="475" r="9"/>
          <circle class="node" cx="193" cy="475" r="3.6" filter="url(#cm-glow)"/>
          <circle class="halo h3" cx="568" cy="541" r="9"/>
          <circle class="node" cx="568" cy="541" r="3.6" filter="url(#cm-glow)"/>
          <circle class="halo h4" cx="140" cy="250" r="9"/>
          <circle class="node" cx="140" cy="250" r="3.6" filter="url(#cm-glow)"/>
          <circle class="halo h1" cx="348" cy="695" r="9"/>
          <circle class="node" cx="348" cy="695" r="3.6" filter="url(#cm-glow)"/>
          <circle class="halo h2" cx="682" cy="297" r="9"/>
          <circle class="node" cx="682" cy="297" r="3.6" filter="url(#cm-glow)"/>
          <circle class="halo h3" cx="279" cy="330" r="9"/>
          <circle class="node" cx="279" cy="330" r="3.6" filter="url(#cm-glow)"/>
          <circle class="halo h4" cx="532" cy="448" r="9"/>
          <circle class="node" cx="532" cy="448" r="3.6" filter="url(#cm-glow)"/>
        </svg>
        <span class="bg-noise"></span>
        <span class="bg-vignette"></span>
      </div>
      <div class="brand-inner">
        <div class="brand-logo">
          <img src="/mail-pwa.png" alt=""/>
          <span>{{ siteTitle }}</span>
        </div>
        <div class="brand-hero">
          <h1>{{ $t('loginPage.heroTitle') }}</h1>
          <p>{{ $t('loginPage.heroDesc') }}</p>
          <ul class="feature-list">
            <li v-for="item in features" :key="item.key">
              <span class="feature-icon" aria-hidden="true" v-html="item.icon"></span>
              <div class="feature-text">
                <strong>{{ $t(`loginPage.${item.key}`) }}</strong>
                <span>{{ $t(`loginPage.${item.key}Desc`) }}</span>
              </div>
            </li>
          </ul>
        </div>
        <div class="brand-footer">
          <span class="secure-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                 stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path
                d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
            {{ $t('loginPage.securedBy') }}
          </span>
          <span>© {{ year }} {{ siteTitle }}</span>
        </div>
      </div>
    </aside>

    <!-- 认证区 -->
    <main class="auth-panel" :class="{ translucent: hasCustomBg }">
      <div class="auth-toolbar">
        <button type="button" class="tool-btn" @click="toggleLang" :aria-label="$t('loginPage.switchLang')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
               stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path
              d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
          {{ settingStore.lang === 'zh' ? 'English' : '中文' }}
        </button>
        <button type="button" class="tool-btn icon" @click="toggleDark" :aria-label="$t('toggleTheme')">
          <svg v-if="uiStore.dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
               stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path
              d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
               stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>
        </button>
      </div>

      <div class="auth-card">
        <div class="mobile-brand">
          <img src="/mail-pwa.png" alt=""/>
          <span>{{ siteTitle }}</span>
        </div>

        <div class="auth-header">
          <h2>{{ $t('loginPage.welcome') }}</h2>
          <p>{{ $t('loginTitle') }}</p>
        </div>

        <!-- 登录（系统仅允许超级管理员使用，已移除注册 / 第三方登录） -->
        <form class="auth-form" novalidate @submit.prevent="submit">
          <div class="field">
            <label class="field-label" for="login-email">{{ $t('emailAccount') }}</label>
            <div class="email-control" :class="{ 'with-domain': showDomainSelect }"
                 :style="{ '--domain-select-width': domainSelectWidth }">
              <el-input id="login-email" v-model="form.email" size="large" name="username" autocomplete="username"
                        :placeholder="$t('loginPage.enterEmail')">
                <template #prefix>
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18"
                       height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>
                </template>
              </el-input>
              <el-select v-if="showDomainSelect" v-model="suffix" size="large" class="domain-select"
                         popper-class="login-domain-popper" :aria-label="$t('selectEmail')" :title="suffix">
                <el-option v-for="item in domainList" :key="item" :label="item" :value="item"/>
              </el-select>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="login-password">{{ $t('password') }}</label>
            <el-input id="login-password" ref="loginPwdRef" v-model="form.password" size="large" type="password"
                      show-password name="password" autocomplete="current-password"
                      :placeholder="$t('loginPage.enterPassword')"
                      @keydown="checkCapsLock" @keyup="checkCapsLock" @blur="capsLock = false">
              <template #prefix>
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5"
                     width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
              </template>
            </el-input>
            <div class="caps-tip" v-if="capsLock" role="status">{{ $t('loginPage.capsLockOn') }}</div>
          </div>
          <el-button class="submit-btn" type="primary" native-type="submit" size="large" :loading="loginLoading">
            {{ $t('loginBtn') }}
          </el-button>
        </form>

        <div class="auth-footer">
          <span class="footer-secure">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                 stroke-linejoin="round" aria-hidden="true"><path
                d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z"/></svg>
            {{ $t('loginPage.encrypted') }}
          </span>
        </div>
      </div>
    </main>

  </div>
</template>

<script setup>
import {toggleTheme} from '@/utils/theme-transition.js'
import router from "@/router";
import {computed, nextTick, reactive, ref, watch} from "vue";
import {login} from "@/request/login.js";
import {websiteConfig} from "@/request/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {useUiStore} from "@/store/ui.js";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js";

const SUFFIX_STORAGE_KEY = 'login-domain-suffix'

const {t} = useI18n();
const accountStore = useAccountStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const settingStore = useSettingStore();
const loginLoading = ref(false)
const capsLock = ref(false)
const loginPwdRef = ref()
const year = new Date().getFullYear()

const features = [
  {
    key: 'feature1',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'
  },
  {
    key: 'feature2',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>'
  },
  {
    key: 'feature3',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>'
  }
]

const form = reactive({
  email: '',
  password: '',
})
const suffix = ref('')
const domainList = computed(() => settingStore.domainList || []);

const savedSuffix = localStorage.getItem(SUFFIX_STORAGE_KEY)
suffix.value = domainList.value.includes(savedSuffix) ? savedSuffix : (domainList.value[0] || '')

watch(suffix, value => {
  if (value) localStorage.setItem(SUFFIX_STORAGE_KEY, value)
})

// 旧版 LinuxDo 回调地址上的 code 参数已无用，清理掉避免泄露到历史记录
if (new URLSearchParams(window.location.search).has('code')) {
  window.history.replaceState({}, '', window.location.origin + window.location.pathname)
}

const siteTitle = computed(() => settingStore.settings.title || 'Cloud Mail')
const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)
const showDomainSelect = computed(() => !hideLoginDomain.value && !form.email.includes('@') && domainList.value.length > 0)
const hasCustomBg = computed(() => !!settingStore.settings.background)

const domainSelectWidth = computed(() => {
  const longest = domainList.value.reduce((max, item) => Math.max(max, item.length), 0)
  return Math.min(Math.max(longest * 8 + 48, 120), 220) + 'px'
})

const panelBg = computed(() => {
  const opacity = Number(settingStore.settings.loginOpacity ?? 1)
  const value = Number.isNaN(opacity) ? 1 : Math.min(1, Math.max(0, opacity))
  return uiStore.dark ? `rgba(20, 20, 20, ${value})` : `rgba(255, 255, 255, ${value})`
})

const loginDarkenFactor = computed(() => {
  const factor = Number(settingStore.settings.loginDarkenFactor ?? 0)
  if (Number.isNaN(factor)) return 0
  return Math.min(1, Math.max(0, factor))
})

const pageStyle = computed(() => {
  const bg = settingStore.settings.background
  if (!bg) return {}
  const bgUrl = cvtR2Url(bg).replace(/["\\\n\r]/g, '')
  return {
    'background-image': `linear-gradient(rgba(0, 0, 0, ${loginDarkenFactor.value}), rgba(0, 0, 0, ${loginDarkenFactor.value})), url("${bgUrl}")`,
    'background-repeat': 'no-repeat',
    'background-size': 'cover',
    'background-position': 'center',
    'background-color': '#0a1a46'
  }
})

function checkCapsLock(e) {
  if (typeof e?.getModifierState === 'function') {
    capsLock.value = e.getModifierState('CapsLock')
  }
}

function toggleLang() {
  const lang = settingStore.lang === 'zh' ? 'en' : 'zh'
  setExtend(lang === 'en' ? 'en' : 'zh-cn')
  settingStore.lang = lang
}

function toggleDark(e) {
  toggleTheme(e)
}

const getFullEmail = (email) => {
  const value = (email || '').trim()
  if (hideLoginDomain.value || value.includes('@')) return value
  return value + suffix.value
}

function showError(message) {
  ElMessage({
    message,
    type: 'error',
    plain: true,
  })
}

const submit = () => {

  if (loginLoading.value) return

  if (!form.email) {
    showError(t('emptyEmailMsg'))
    return
  }

  const email = getFullEmail(form.email);

  if (!isEmail(email)) {
    showError(t('notEmailMsg'))
    return
  }

  if (!form.password) {
    showError(t('emptyPwdMsg'))
    return
  }

  loginLoading.value = true
  login(email, form.password).then(async data => {
    await saveToken(data.token)
  }).catch(() => {
    form.password = ''
    nextTick(() => loginPwdRef.value?.focus())
  }).finally(() => {
    loginLoading.value = false
  })
}

async function saveToken(token) {
  localStorage.setItem('token', token)
  let user;
  try {
    user = await loginUserInfo();
  } catch (error) {
    localStorage.removeItem('token');
    throw error;
  }
  refreshWebsiteConfig()
  accountStore.currentAccountId = user.account.accountId;
  accountStore.currentAccount = user.account;
  userStore.user = user;
  const routers = permsToRouter(user.permKeys);
  routers.forEach(routerData => {
    router.addRoute('layout', routerData);
  });
  await router.replace({name: 'layout'})
  uiStore.showNotice()
}

function refreshWebsiteConfig() {
  websiteConfig().then(setting => {
    settingStore.settings = setting
    settingStore.domainList = setting.domainList
    if (!suffix.value && setting.domainList.length > 0) {
      suffix.value = setting.domainList[0]
    }
    document.title = setting.title
  }).catch(e => {
    console.error(e)
  })
}

</script>

<style>
.el-select-dropdown__item {
  padding: 0 15px;
}

.login-domain-popper .el-select-dropdown__item {
  padding: 0 14px;
}
</style>

<style lang="scss" scoped>

.login-page {
  --brand-1: #081634;
  --brand-2: #0f2f78;
  --brand-3: #1b5fd9;
  --brand-primary: #1f63de;
  --brand-primary-hover: #3474ea;
  --brand-primary-active: #1750b9;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(460px, 0.88fr);
  min-height: 100dvh;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--el-bg-color);
  font-family: var(--cm-font-family);

  @media (max-width: 1023px) {
    grid-template-columns: 1fr;
    &:not(.has-custom-bg) {
      background: radial-gradient(900px 520px at 0% 0%, rgba(31, 99, 222, 0.16), transparent 60%),
      radial-gradient(620px 420px at 100% 0%, rgba(109, 74, 255, 0.10), transparent 60%),
      radial-gradient(700px 460px at 100% 100%, rgba(16, 198, 230, 0.12), transparent 60%),
      var(--el-bg-color);

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image: radial-gradient(rgba(31, 99, 222, 0.18) 1px, transparent 1.3px);
        background-size: 20px 20px;
        -webkit-mask-image: radial-gradient(ellipse 90% 45% at 50% 0%, #000 0%, transparent 75%);
        mask-image: radial-gradient(ellipse 90% 45% at 50% 0%, #000 0%, transparent 75%);
      }
    }
  }
}

/* ---------------- 品牌区 ---------------- */

.brand-panel {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  color: #fff;
  background: radial-gradient(120% 80% at 0% 100%, rgba(8, 20, 60, 0.9) 0%, transparent 60%),
  linear-gradient(150deg, #050b1f 0%, #0a1a46 40%, #0e3593 75%, #1652d6 100%);

  &.custom {
    background: linear-gradient(160deg, rgba(4, 10, 28, 0.62) 0%, rgba(4, 10, 28, 0.18) 55%, rgba(4, 10, 28, 0.5) 100%);
  }

  @media (max-width: 1023px) {
    display: none;
  }
}

.brand-decor {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  contain: strict;
}

/* 极光光晕：只对 transform 做动画，由合成层处理，不触发重绘 */
.bg-aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  will-change: transform;

  &.a1 {
    width: 640px;
    height: 640px;
    top: -240px;
    right: -180px;
    background: radial-gradient(circle, #2f6bff 0%, rgba(47, 107, 255, 0) 70%);
    opacity: 0.8;
    animation: cm-aurora-1 22s ease-in-out infinite alternate;
  }

  &.a2 {
    width: 540px;
    height: 540px;
    top: 40%;
    left: -240px;
    background: radial-gradient(circle, #6d4aff 0%, rgba(109, 74, 255, 0) 70%);
    opacity: 0.42;
    animation: cm-aurora-2 28s ease-in-out infinite alternate;
  }

  &.a3 {
    width: 580px;
    height: 580px;
    bottom: -280px;
    right: 4%;
    background: radial-gradient(circle, #10c6e6 0%, rgba(16, 198, 230, 0) 70%);
    opacity: 0.36;
    animation: cm-aurora-3 26s ease-in-out infinite alternate;
  }
}

/* 点阵纹理 */
.bg-dots {
  position: absolute;
  inset: 0;
  opacity: 0.5;
  background-image: radial-gradient(rgba(255, 255, 255, 0.24) 1px, transparent 1.3px);
  background-size: 22px 22px;
  -webkit-mask-image: radial-gradient(ellipse 70% 55% at 16% 18%, #000 0%, transparent 72%);
  mask-image: radial-gradient(ellipse 70% 55% at 16% 18%, #000 0%, transparent 72%);
}

/* 透视网格地面 */
.bg-floor {
  position: absolute;
  left: -40%;
  right: -40%;
  bottom: -2px;
  height: 46%;
  background-image: linear-gradient(rgba(125, 170, 255, 0.2) 1px, transparent 1px),
  linear-gradient(90deg, rgba(125, 170, 255, 0.2) 1px, transparent 1px);
  background-size: 64px 64px;
  background-position: center bottom;
  transform: perspective(520px) rotateX(64deg);
  transform-origin: 50% 100%;
  -webkit-mask-image: linear-gradient(to top, #000 0%, rgba(0, 0, 0, 0.55) 35%, transparent 85%);
  mask-image: linear-gradient(to top, #000 0%, rgba(0, 0, 0, 0.55) 35%, transparent 85%);
}

/* 斜向扫光 */
.bg-beam {
  position: absolute;
  top: -30%;
  left: -60%;
  width: 45%;
  height: 160%;
  opacity: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(160, 200, 255, 0.1) 50%, transparent 100%);
  transform: rotate(18deg);
  animation: cm-beam 12s cubic-bezier(0.45, 0.05, 0.35, 1) 2s infinite;
}

/* 全球投递网络（右上，部分超出画布） */
.bg-network {
  position: absolute;
  top: 36%;
  right: -34%;
  width: min(880px, 96%);
  height: auto;
  aspect-ratio: 1;
  transform: translateY(-50%);
  -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 40%, transparent 70%);
  mask-image: radial-gradient(circle at 50% 50%, #000 40%, transparent 70%);

  .ring {
    stroke: rgba(170, 200, 255, 0.12);
    stroke-width: 1;

    &.dash {
      stroke: rgba(170, 200, 255, 0.24);
      stroke-dasharray: 2 8;
    }
  }

  .orbits {
    transform-box: view-box;
    transform-origin: 50% 50%;
    animation: cm-spin 90s linear infinite;
  }

  .orbit {
    stroke: rgba(130, 180, 255, 0.22);
    stroke-width: 1;
  }

  .sat {
    fill: #a9ccff;
  }

  .link {
    stroke: rgba(150, 190, 255, 0.24);
    stroke-width: 1.1;
  }

  .pkt {
    stroke: #a6c8ff;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-dasharray: 6 94;
    animation: cm-pkt 5s linear infinite;

    &.d2 { animation-duration: 6.5s; animation-delay: -1.3s; }
    &.d3 { animation-duration: 5.8s; animation-delay: -2.6s; }
    &.d4 { animation-duration: 7.2s; animation-delay: -0.8s; }
    &.d5 { animation-duration: 6s; animation-delay: -3.4s; }
  }

  .node {
    fill: #d6e5ff;
  }

  .halo {
    fill: rgba(96, 165, 250, 0.35);
    transform-box: fill-box;
    transform-origin: center;
    animation: cm-pulse 3.6s ease-out infinite;

    &.h2 { animation-delay: -0.9s; }
    &.h3 { animation-delay: -1.8s; }
    &.h4 { animation-delay: -2.7s; }
  }

  .core-box {
    fill: rgba(255, 255, 255, 0.07);
    stroke: rgba(255, 255, 255, 0.24);
  }

  .core-icon {
    stroke: #e3edff;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (max-width: 1279px) {
    opacity: 0.55;
    .core {
      display: none;
    }
  }
}

/* 胶片噪点：增加质感并消除渐变色带 */
.bg-noise {
  position: absolute;
  inset: 0;
  opacity: 0.07;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}

/* 左侧文字区压暗 + 四周暗角，保证文字对比度 */
.bg-vignette {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(4, 9, 26, 0.55) 0%, rgba(4, 9, 26, 0.12) 50%, transparent 72%),
  radial-gradient(140% 100% at 50% 50%, transparent 55%, rgba(2, 6, 20, 0.55) 100%);
}

@keyframes cm-aurora-1 {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-80px, 60px, 0) scale(1.12); }
}

@keyframes cm-aurora-2 {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(90px, -50px, 0) scale(1.15); }
}

@keyframes cm-aurora-3 {
  from { transform: translate3d(0, 0, 0) scale(1.05); }
  to { transform: translate3d(-70px, -40px, 0) scale(0.95); }
}

@keyframes cm-beam {
  0% { transform: rotate(18deg) translateX(0); opacity: 0; }
  8% { opacity: 1; }
  45% { transform: rotate(18deg) translateX(420%); opacity: 0; }
  100% { transform: rotate(18deg) translateX(420%); opacity: 0; }
}

@keyframes cm-spin {
  to { transform: rotate(360deg); }
}

@keyframes cm-pkt {
  from { stroke-dashoffset: 100; }
  to { stroke-dashoffset: 0; }
}

@keyframes cm-pulse {
  0% { transform: scale(0.6); opacity: 0.9; }
  80%, 100% { transform: scale(2.4); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .bg-aurora,
  .bg-network .orbits,
  .bg-network .pkt,
  .bg-network .halo,
  .feature-list li {
    animation: none !important;
    transition: none !important;
  }
  .bg-beam {
    display: none;
  }
}

.brand-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 40px;
  height: 100%;
  min-height: 100dvh;
  padding: 44px clamp(40px, 5vw, 80px);
  box-sizing: border-box;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.01em;

  img {
    width: 38px;
    height: 38px;
    padding: 5px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-sizing: border-box;
  }
}

.brand-hero {
  max-width: 540px;

  h1 {
    font-size: clamp(30px, 2.8vw, 42px);
    line-height: 1.18;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 18px;
  }

  p {
    font-size: 15px;
    line-height: 1.75;
    color: rgba(255, 255, 255, 0.76);
    margin-bottom: 36px;
  }
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 12px;

  li {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    max-width: 470px;
    padding: 16px 18px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(8px);
    transition: background 0.25s, transform 0.25s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateX(4px);
    }
  }
}

.feature-icon {
  flex: 0 0 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: #d6e4ff;
  background: rgba(79, 139, 255, 0.24);

  :deep(svg) {
    width: 22px;
    height: 22px;
  }
}

.feature-text {
  strong {
    display: block;
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 3px;
  }

  span {
    font-size: 13px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.68);
  }
}

.brand-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.secure-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);

  svg {
    width: 14px;
    height: 14px;
  }
}

/* ---------------- 认证区 ---------------- */

.auth-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 80px 40px 40px;
  box-sizing: border-box;
  isolation: isolate;
  background: radial-gradient(640px 420px at 100% 0%, rgba(31, 99, 222, 0.08), transparent 65%),
  radial-gradient(520px 380px at 0% 100%, rgba(109, 74, 255, 0.06), transparent 65%),
  var(--el-bg-color);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-image: radial-gradient(rgba(31, 99, 222, 0.16) 1px, transparent 1.3px);
    background-size: 20px 20px;
    -webkit-mask-image: radial-gradient(420px 320px at 100% 0%, #000 0%, transparent 75%);
    mask-image: radial-gradient(420px 320px at 100% 0%, #000 0%, transparent 75%);
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 1px;
    pointer-events: none;
    background: linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.45) 35%, rgba(109, 74, 255, 0.35) 65%, transparent);
  }

  &.translucent::before,
  &.translucent::after {
    display: none;
  }

  &.translucent {
    background: v-bind(panelBg);
    backdrop-filter: blur(16px) saturate(1.2);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    border-left: 1px solid rgba(255, 255, 255, 0.16);
  }

  @media (max-width: 1023px) {
    padding: 76px 18px 28px;
    background: transparent;
    &::before,
    &::after {
      display: none;
    }
    &.translucent {
      background: transparent;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border-left: none;
    }
  }
}

.auth-toolbar {
  position: absolute;
  top: 20px;
  right: 24px;
  display: flex;
  gap: 8px;

  @media (max-width: 1023px) {
    right: 16px;
    top: 16px;
  }
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;

  &:hover {
    color: var(--brand-primary);
    border-color: var(--brand-primary);
  }

  &.icon {
    width: 34px;
    padding: 0;
    justify-content: center;
  }

  svg {
    width: 16px;
    height: 16px;
  }
}

.auth-card {
  width: 100%;
  max-width: 400px;

  @media (max-width: 1023px) {
    max-width: 440px;
    padding: 28px 22px;
    border-radius: 16px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    box-shadow: 0 12px 40px -16px rgba(15, 35, 80, 0.22);
    box-sizing: border-box;
    .has-custom-bg & {
      background: v-bind(panelBg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
  }
}

.mobile-brand {
  display: none;

  @media (max-width: 1023px) {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 22px;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    img {
      width: 32px;
      height: 32px;
    }
  }
}

.auth-header {
  margin-bottom: 26px;

  h2 {
    font-size: 26px;
    line-height: 1.3;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--el-text-color-primary);
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
}

.auth-form {
  display: flex;
  flex-direction: column;
}

.field {
  margin-bottom: 18px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.input-icon {
  width: 18px;
  height: 18px;
  color: var(--el-text-color-placeholder);
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
  background: var(--el-bg-color);
  transition: box-shadow 0.2s;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--brand-primary) inset, 0 0 0 4px rgba(31, 99, 222, 0.14);
}

.email-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 40px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);

  &.with-domain {
    grid-template-columns: minmax(0, 1fr) min(48%, var(--domain-select-width));
    @media (max-width: 360px) {
      grid-template-columns: minmax(0, 1fr) min(60%, var(--domain-select-width));
    }
  }

  &:focus-within {
    border-color: var(--brand-primary);
  }

  :deep(.el-input),
  .domain-select {
    min-width: 0;
    width: 100%;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    min-height: 40px;
    border-radius: 0;
    box-shadow: none !important;
  }

  .domain-select {
    border-left: 1px solid var(--el-border-color);
    background: var(--el-fill-color-light);
  }

  :deep(.el-select__wrapper) {
    padding: 0 10px 0 12px;
    background: transparent;
  }

  :deep(.el-select__selection) {
    min-width: 0;
  }
}

.caps-tip {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.submit-btn {
  --el-button-bg-color: var(--brand-primary);
  --el-button-border-color: var(--brand-primary);
  --el-button-hover-bg-color: var(--brand-primary-hover);
  --el-button-hover-border-color: var(--brand-primary-hover);
  --el-button-active-bg-color: var(--brand-primary-active);
  --el-button-active-border-color: var(--brand-primary-active);
  width: 100%;
  height: 44px;
  margin-top: 6px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 10px 22px -12px rgba(31, 99, 222, 0.75);
}

.auth-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-placeholder);

  a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: inherit;
    text-decoration: none;
    transition: color 0.2s;

    &:hover {
      color: var(--brand-primary);
    }
  }
}

.footer-secure {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  svg {
    width: 14px;
    height: 14px;
  }
}

:deep(.el-button + .el-button) {
  margin: 0;
}

</style>
