// 超级管理员单用户模式：默认开启，只有 env.admin 可以登录使用
// 如需恢复多用户（注册 / LinuxDo / 普通用户登录），在 wrangler.toml 的 [vars] 中设置 admin_only = false

const adminMode = {

	isAdminOnly(c) {
		const value = c?.env?.admin_only;
		return !(value === false || value === 'false');
	},

	adminEmail(c) {
		return String(c?.env?.admin || '').trim().toLowerCase();
	},

	isAdmin(c, email) {
		const admin = this.adminEmail(c);
		return !!admin && typeof email === 'string' && email.trim().toLowerCase() === admin;
	}
};

export default adminMode;
