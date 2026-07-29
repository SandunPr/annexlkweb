// AnnexLK Client UI Utilities (Toast & Modal)

const UI = {
  /**
   * Display a floating toast notification.
   * @param {string} message Toast body text
   * @param {'success' | 'error' | 'warning' | 'info'} type Toast severity level
   * @param {number} duration Timeout in milliseconds
   */
  showToast(message, type = 'success', duration = 4000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icon mapping (simple text symbols for zero dependency simplicity)
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <div class="flex align-center gap-10">
        <span>${icon}</span>
        <span>${message}</span>
      </div>
      <button class="modal-close" style="font-size: 14px; margin-left: 15px;">&times;</button>
    `;

    container.appendChild(toast);

    // Trigger reflow to animate
    setTimeout(() => toast.classList.add('show'), 50);

    // Close on button click
    toast.querySelector('button').addEventListener('click', () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    });

    // Auto remove
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  },

  /**
   * Initialize custom modal triggers.
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  }
};

export default UI;
