// 主题切换的圆形揭幕动画。
// 优先使用 View Transitions API；不支持时降级为只做 transform: scale 的圆形色块；
// 连 Web Animations 都不支持、开启“减少动态效果”或页面在后台时直接切换。
import {useUiStore} from '@/store/ui.js'

const DURATION = 520
const EASING = 'ease-out'
// 动画结束后稍等再恢复颜色 transition，避免最后一帧卡顿
const RESTORE_DELAY = 80
// 降级色块用的暗色背景（与 Element Plus 暗色 --el-bg-color 一致）
const DARK_BG = '#141414'
const VARS = ['--vt-x', '--vt-y', '--vt-end-radius']

let runId = 0
// 正在进行的切换目标。动画中再次点击时以它为准，避免回调尚未执行时方向判断错误
let pendingDark = null
let activeTransition = null
let activeFallback = null
let restoreTimer = null

// 只切换主题本身（class、地址栏颜色、store），不带动画
export function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark)
    const isMobile = !window.matchMedia('(pointer: fine) and (hover: hover)').matches
    document.getElementById('theme-color-meta')?.setAttribute(
        'content',
        isDark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#FFFFFF' : '#F1F1F1')
    )
    useUiStore().dark = isDark
}

/**
 * 切换主题。
 * @param {Event} [event] 触发事件：鼠标/触摸点击取点击位置为圆心；键盘触发（没有坐标）取按钮中心
 * @param {{dark?: boolean, target?: Element}} [options] dark 指定目标主题，缺省为取反；target 为没有坐标时用作圆心的元素
 */
export function toggleTheme(event, options = {}) {
    const current = pendingDark ?? useUiStore().dark
    const nextIsDark = options.dark ?? !current
    if (nextIsDark === current) return

    // 必须同步读取：currentTarget 只在事件派发期间有效
    const {x, y} = originOf(event, options.target)

    // 结束上一次动画（View Transition 会跳过并执行完它的更新回调，降级动画会立即落到终态）
    finishRunning()

    const id = ++runId
    pendingDark = nextIsDark
    const commit = () => applyTheme(nextIsDark)

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || document.visibilityState !== 'visible') {
        commit()
        end(id)
        return
    }

    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 10

    if (typeof document.startViewTransition === 'function') {
        viaViewTransition(id, nextIsDark, x, y, radius, commit)
    } else if (typeof Element.prototype.animate === 'function') {
        viaFallback(id, nextIsDark, x, y, radius, commit)
    } else {
        commit()
        end(id)
    }
}

function originOf(event, target) {
    // 键盘触发的 click 事件 detail 为 0、坐标为 0；change 等事件没有坐标
    const hasPointer = event && event.detail !== 0 && Number.isFinite(event.clientX) &&
        Number.isFinite(event.clientY) && !(event.clientX === 0 && event.clientY === 0)
    if (hasPointer) {
        return {x: event.clientX, y: event.clientY}
    }
    const rect = (target || event?.currentTarget || event?.target)?.getBoundingClientRect?.()
    if (rect && (rect.width || rect.height)) {
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
    }
    return {x: window.innerWidth / 2, y: window.innerHeight / 2}
}

function viaViewTransition(id, nextIsDark, x, y, radius, commit) {
    const root = document.documentElement
    // 先写好圆心、半径和方向，CSS 动画从第一帧起就有正确的裁剪，避免闪屏
    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-end-radius', `${radius}px`)
    root.dataset.themeTo = nextIsDark ? 'dark' : 'light'
    freezeTransitions()

    let transition
    try {
        transition = document.startViewTransition(commit)
    } catch {
        commit()
        end(id)
        return
    }
    activeTransition = transition
    // 被跳过时 ready 会 reject，吞掉避免控制台报未处理的 Promise
    transition.ready?.catch(() => {})
    transition.finished.then(() => end(id), () => end(id))
}

function viaFallback(id, nextIsDark, x, y, radius, commit) {
    freezeTransitions()
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    Object.assign(el.style, {
        position: 'fixed',
        left: `${x - radius}px`,
        top: `${y - radius}px`,
        width: `${radius * 2}px`,
        height: `${radius * 2}px`,
        borderRadius: '50%',
        background: DARK_BG,
        pointerEvents: 'none',
        zIndex: '2147483647',
        willChange: 'transform',
        transform: nextIsDark ? 'scale(0)' : 'scale(1)',
    })
    document.body.appendChild(el)

    // 切到浅色：先切换，再让暗色色块向圆心收缩，露出新画面
    if (!nextIsDark) commit()

    let done = false
    const animation = el.animate(
        [{transform: nextIsDark ? 'scale(0)' : 'scale(1)'}, {transform: nextIsDark ? 'scale(1)' : 'scale(0)'}],
        {duration: DURATION, easing: EASING, fill: 'forwards'}
    )
    const finish = () => {
        if (done) return
        done = true
        // 切到暗色：色块铺满后再切换并移除，用户看不到中间状态
        if (nextIsDark) commit()
        animation.cancel()
        el.remove()
    }
    activeFallback = {finish}
    animation.onfinish = () => {
        finish()
        end(id)
    }
}

function finishRunning() {
    activeTransition?.skipTransition?.()
    activeTransition = null
    activeFallback?.finish()
    activeFallback = null
}

// 动画期间关闭页面上的颜色 transition，否则新画面会一边揭开一边渐变
function freezeTransitions() {
    clearTimeout(restoreTimer)
    document.documentElement.classList.add('theme-switching')
}

function end(id) {
    // 已经开始了新的一次切换，旧的收尾不能清掉新的状态
    if (id !== runId) return
    const root = document.documentElement
    activeTransition = null
    activeFallback = null
    pendingDark = null
    delete root.dataset.themeTo
    VARS.forEach(name => root.style.removeProperty(name))
    clearTimeout(restoreTimer)
    restoreTimer = setTimeout(() => {
        if (id === runId) root.classList.remove('theme-switching')
    }, RESTORE_DELAY)
}
