import { hydrateLucideIcons } from './lucide-icons.js';

/** @type {(viewId: string) => void} */
let onViewChange = () => {};

/**
 * @param {(viewId: string) => void} callback
 */
export function onNavigate(callback) {
  onViewChange = callback;
}

/**
 * @param {string} viewId
 */
export function navigateTo(viewId) {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('view--active', view.dataset.view === viewId);
  });

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('nav-item--active', item.dataset.view === viewId);
  });

  onViewChange(viewId);
}

/**
 * @param {string} viewId
 * @param {number} count
 */
export function setNavBadge(viewId, count) {
  const badge = document.getElementById(`nav-badge-${viewId}`);
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

export function initSidebar() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  hydrateLucideIcons(document.querySelector('.sidebar') ?? document);

  nav.addEventListener('click', (event) => {
    const target = event.target.closest('.nav-item');
    if (!target || !(target instanceof HTMLElement)) return;

    const viewId = target.dataset.view;
    if (viewId) {
      navigateTo(viewId);
    }
  });
}
