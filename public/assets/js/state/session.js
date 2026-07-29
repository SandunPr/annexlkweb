// AnnexLK Global Client Session State Manager

const Session = {
  /**
   * Save user and access token details to storage.
   */
  save(user, accessToken) {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('accessToken', accessToken);
  },

  /**
   * Clear session storage.
   */
  clear() {
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
  },

  /**
   * Get currently logged-in user profile.
   */
  getUser() {
    const userStr = localStorage.getItem('user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Get JWT access token.
   */
  getToken() {
    return localStorage.getItem('accessToken') || null;
  },

  /**
   * Check if user is authenticated.
   */
  isAuthenticated() {
    return this.getToken() !== null;
  },

  /**
   * Check if current user has the administrator role.
   */
  isAdmin() {
    const user = this.getUser();
    return user && user.role === 'ADMINISTRATOR';
  },

  /**
   * Check if current user is an owner.
   */
  isOwner() {
    const user = this.getUser();
    return user && user.role === 'PROPERTY_OWNER';
  },

  /**
   * Manage theme settings.
   */
  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    return next;
  }
};

export default Session;
