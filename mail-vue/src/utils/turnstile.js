// 按需加载 Cloudflare Turnstile，避免首屏加载第三方脚本
let loading = null

export function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile)
    if (loading) return loading
    loading = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile unavailable'))
        script.onerror = () => {
            loading = null
            script.remove()
            reject(new Error('turnstile load failed'))
        }
        document.head.appendChild(script)
    })
    return loading
}
