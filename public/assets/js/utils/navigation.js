// AnnexLK Global Dynamic Navigation Builder
import Session from '../state/session.js';
import AuthService from '../auth/authService.js';

const Navigation = {
  /**
   * Inject header navbar and footer layouts dynamically.
   */
  init() {
    Session.initTheme();
    this.injectHeader();
    this.injectFooter();
    this.injectBottomNav();
    this.bindEvents();
  },

  injectHeader() {
    const headerEl = document.getElementById('app-header');
    if (!headerEl) return;

    headerEl.className = 'app-header';

    const user = Session.getUser();
    let navLinksHtml = `
      <a href="/index.html" class="nav-link">Home</a>
      <a href="/pages/search.html" class="nav-link">Search</a>
      <a href="/pages/about.html" class="nav-link">About Us</a>
      <a href="/pages/contact.html" class="nav-link">Contact Us</a>
    `;

    let actionsHtml = '';

    if (user) {
      const avatarHtml = user.avatar_url
        ? `<img src="${user.avatar_url}" class="nav-avatar" alt="" referrerpolicy="no-referrer">`
        : `<span aria-hidden="true">👤</span>`;
      if (user.role === 'ADMINISTRATOR') {
        navLinksHtml += `<a href="/pages/admin/dashboard.html" class="nav-link">Admin Admin Panel</a>`;
      } else if (user.role === 'PROPERTY_OWNER') {
        navLinksHtml += `<a href="/pages/owner-dashboard.html" class="nav-link">My Listings Dashboard</a>`;
      } else if (user.role === 'RENTER') {
        navLinksHtml += `<a href="/pages/favourites.html" class="nav-link">Favourites Saved</a>`;
      }

      actionsHtml = `
        <a href="/pages/profile.html" class="nav-link flex align-center gap-10" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${user.full_name || 'My Profile'}">
          ${avatarHtml} ${user.full_name || 'My Profile'}
        </a>
        <button id="logout-btn" class="btn btn-outline" style="padding: 6px 12px; font-size: 13px;">Log Out</button>
      `;
    } else {
      actionsHtml = `
        <a href="/pages/login.html" class="nav-link">Login</a>
        <a href="/pages/register.html" class="btn btn-primary" style="padding: 8px 16px; border-radius: var(--radius-sm);">Register</a>
      `;
    }

    headerEl.innerHTML = `
      <div class="container header-container">
        <a href="/index.html" class="app-logo">
          🏠 Annex<span>LK</span>
        </a>
        
        <nav class="app-nav">
          ${navLinksHtml}
        </nav>

        <div class="nav-actions">
          <button id="theme-toggle-btn" class="btn btn-outline" style="padding: 8px; border-radius: var(--radius-full); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;" title="Toggle Theme">
            🌓
          </button>
          ${actionsHtml}
        </div>
      </div>
    `;

    // Set active nav link
    const path = window.location.pathname;
    headerEl.querySelectorAll('.nav-link').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && path.includes(href.replace('.html', ''))) {
        link.classList.add('active');
      }
    });
  },

  injectFooter() {
    const footerEl = document.getElementById('app-footer');
    if (!footerEl) return;

    footerEl.className = 'app-footer';

    footerEl.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <h3>AnnexLK</h3>
            <p>Find trusted boarding rooms, annexes, and rental properties in Sri Lanka. Tailored for students, workers, and families.</p>
            <div class="social-links">
              <a href="#" class="social-icon">🔵</a>
              <a href="#" class="social-icon">🕊️</a>
              <a href="#" class="social-icon">📸</a>
            </div>
          </div>
          
          <div class="footer-links">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="/index.html">Home</a></li>
              <li><a href="/pages/search.html">Search Listings</a></li>
              <li><a href="/pages/register.html?role=PROPERTY_OWNER">Publish Property</a></li>
            </ul>
          </div>

          <div class="footer-links">
            <h4>Safety & Policy</h4>
            <ul>
              <li><a href="/pages/terms.html">Terms &amp; Conditions</a></li>
              <li><a href="/pages/privacy.html">Privacy Policy</a></li>
              <li><a href="/pages/cookies.html">Cookie Policy</a></li>
            </ul>
          </div>

          <div class="footer-links">
            <h4>About Us</h4>
            <ul>
              <li><a href="/pages/about.html">About AnnexLK</a></li>
              <li><a href="/pages/contact.html">Contact Us</a></li>
              <li><a href="/pages/search.html">Browse Properties</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom">
          <p>&copy; ${new Date().getFullYear()} AnnexLK Discovery Platform. All rights reserved.</p>
          <p>Handcrafted in Sri Lanka 🇱🇰</p>
        </div>
      </div>
    `;
  },

  injectBottomNav() {
    // Add bottom nav elements on mobile screens
    let bottomNav = document.getElementById('app-bottom-nav');
    if (!bottomNav) {
      bottomNav = document.createElement('div');
      bottomNav.id = 'app-bottom-nav';
      bottomNav.className = 'bottom-nav';
      document.body.appendChild(bottomNav);
    }

    const user = Session.getUser();
    let dashboardHref = '/pages/login.html';
    let dashboardLabel = 'Dashboard';

    if (user) {
      if (user.role === 'ADMINISTRATOR') {
        dashboardHref = '/pages/admin/dashboard.html';
        dashboardLabel = 'Admin';
      } else if (user.role === 'PROPERTY_OWNER') {
        dashboardHref = '/pages/owner-dashboard.html';
        dashboardLabel = 'My Properties';
      } else {
        dashboardHref = '/pages/favourites.html';
        dashboardLabel = 'Favourites';
      }
    }

    bottomNav.innerHTML = `
      <a href="/index.html" class="bottom-nav-item ${window.location.pathname === '/index.html' || window.location.pathname === '/' ? 'active' : ''}">
        <span>🏠</span>
        <span>Home</span>
      </a>
      <a href="/pages/search.html" class="bottom-nav-item ${window.location.pathname.includes('search') ? 'active' : ''}">
        <span>🔍</span>
        <span>Search</span>
      </a>
      <a href="${dashboardHref}" class="bottom-nav-item ${window.location.pathname.includes('dashboard') || window.location.pathname.includes('favourites') ? 'active' : ''}">
        <span>📊</span>
        <span>${dashboardLabel}</span>
      </a>
      <a href="/pages/profile.html" class="bottom-nav-item ${window.location.pathname.includes('profile') ? 'active' : ''}">
        <span>👤</span>
        <span>Profile</span>
      </a>
    `;
  },

  bindEvents() {
    // Bind theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        Session.toggleTheme();
      });
    }

    // Bind logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to log out of current session?')) {
          await AuthService.logout();
        }
      });
    }
  }
};

export default Navigation;
export { Navigation };
