// AnnexLK Client Authentication service Wrapper
import client from '../api/client.js';
import Session from '../state/session.js';

const AuthService = {
  /**
   * Log in user with local credentials.
   */
  async login(email, password) {
    const res = await client.post('auth/login', { email, password });
    if (res.success) {
      Session.save(res.data.user, res.data.accessToken);
    }
    return res;
  },

  /**
   * Register a new user.
   */
  async register({ email, password, roleName, fullName, phoneNumber }) {
    return await client.post('auth/register', { email, password, roleName, fullName, phoneNumber });
  },

  /**
   * Log in with Google credentials.
   */
  async loginWithGoogle(googleIdToken) {
    const res = await client.post('auth/google', { idToken: googleIdToken });
    if (res.success) {
      Session.save(res.data.user, res.data.accessToken);
    }
    return res;
  },

  /**
   * Log out current session.
   */
  async logout() {
    try {
      await client.post('auth/logout');
    } catch (e) {
      // Ignore API errors on logout to ensure clean client clear
    } finally {
      Session.clear();
      window.location.href = '/index.html';
    }
  },

  /**
   * Log out all sessions.
   */
  async logoutAll() {
    try {
      await client.post('auth/logout-all');
    } catch (e) {
      // Ignore
    } finally {
      Session.clear();
      window.location.href = '/index.html';
    }
  }
};

export default AuthService;
