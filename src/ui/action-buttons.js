import { renderLucideIcon, ActionIcons } from './lucide-icons.js';

/** @typedef {'default' | 'primary' | 'danger'} ActionButtonVariant */

/**
 * @param {string} text
 * @returns {string}
 */
function escapeAttr(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeLabel(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * @param {{
 *   action: string;
 *   id?: string;
 *   label: string;
 *   icon: import('lucide').IconNode;
 *   variant?: ActionButtonVariant;
 *   disabled?: boolean;
 * }} options
 * @returns {string}
 */
export function renderActionButton(options) {
  const variant = options.variant ?? 'default';
  const disabled = options.disabled ? ' disabled' : '';
  const idAttr = options.id != null ? ` data-id="${escapeAttr(String(options.id))}"` : '';

  return `<button class="action-btn action-btn--${variant}" type="button" data-action="${escapeAttr(options.action)}"${idAttr} title="${escapeAttr(options.label)}" aria-label="${escapeAttr(options.label)}"${disabled}>
    ${renderLucideIcon(options.icon, { className: 'action-btn__icon', width: 16, height: 16 })}
    <span class="action-btn__label">${escapeLabel(options.label)}</span>
  </button>`;
}

/**
 * @param {string} buttonsHtml
 * @param {string} [extraClass]
 * @returns {string}
 */
export function renderActionBar(buttonsHtml, extraClass = '') {
  const classes = ['action-bar', extraClass].filter(Boolean).join(' ');
  return `<div class="${classes}">${buttonsHtml}</div>`;
}

/**
 * @param {string} [label]
 * @returns {string}
 */
export function renderBackButton(label = 'Volver') {
  return renderActionButton({
    action: 'back',
    label,
    icon: ActionIcons.back,
    variant: 'default',
  });
}

export { ActionIcons };
