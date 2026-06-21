import {
  createElement,
  FileText,
  Wrench,
  History,
  Users,
  Package,
  BarChart3,
  LogOut,
  ArrowLeft,
  Eye,
  Pencil,
  CircleCheckBig,
  Trash2,
  BadgeCheck,
  CircleCheck,
  CircleX,
  TriangleAlert,
  CircleAlert,
  CircleHelp,
  Info,
  Loader2,
  ShieldBan,
  Inbox,
  UserRound,
} from 'lucide';

/** @typedef {import('lucide').IconNode} LucideIcon */

/**
 * @param {LucideIcon} icon
 * @param {{
 *   className?: string;
 *   width?: number;
 *   height?: number;
 *   strokeWidth?: number;
 *   spin?: boolean;
 * }} [options]
 * @returns {string}
 */
export function renderLucideIcon(icon, options = {}) {
  const {
    className = '',
    width = 24,
    height = 24,
    strokeWidth = 2,
    spin = false,
  } = options;

  const classes = [className, spin ? 'lucide-icon--spin' : ''].filter(Boolean).join(' ');

  return createElement(icon, {
    class: classes || undefined,
    width,
    height,
    'stroke-width': strokeWidth,
    'aria-hidden': 'true',
  }).outerHTML;
}

/**
 * @param {LucideIcon} icon
 * @param {{
 *   className?: string;
 *   width?: number;
 *   height?: number;
 *   strokeWidth?: number;
 *   spin?: boolean;
 * }} [options]
 * @returns {SVGElement}
 */
export function createLucideIconElement(icon, options = {}) {
  const {
    className = '',
    width = 24,
    height = 24,
    strokeWidth = 2,
    spin = false,
  } = options;

  const classes = [className, spin ? 'lucide-icon--spin' : ''].filter(Boolean).join(' ');

  return createElement(icon, {
    class: classes || undefined,
    width,
    height,
    'stroke-width': strokeWidth,
    'aria-hidden': 'true',
  });
}

/** @type {Record<string, LucideIcon>} */
export const NavIcons = {
  cotizaciones: FileText,
  ot: Wrench,
  historial: History,
  clientes: Users,
  productos: Package,
  reportes: BarChart3,
  logout: LogOut,
};

export const ActionIcons = {
  back: ArrowLeft,
  eye: Eye,
  edit: Pencil,
  pdf: FileText,
  approve: CircleCheckBig,
  delete: Trash2,
  reviewed: BadgeCheck,
  finalize: CircleCheck,
  reject: CircleX,
};

/** @type {Record<string, LucideIcon>} */
export const AlertIcons = {
  danger: TriangleAlert,
  warning: CircleAlert,
  primary: CircleHelp,
  info: Info,
  success: CircleCheck,
  error: CircleX,
};

export const StateIcons = {
  emptyQuotes: FileText,
  emptyInbox: Inbox,
  emptyOt: Wrench,
  loading: Loader2,
  accessDenied: ShieldBan,
  user: UserRound,
};

/**
 * @param {ParentNode} [root]
 */
export function hydrateLucideIcons(root = document) {
  root.querySelectorAll('[data-lucide]').forEach((host) => {
    if (!(host instanceof HTMLElement)) return;

    const key = host.getAttribute('data-lucide');
    if (!key) return;

    const icon = NavIcons[key] ?? StateIcons[/** @type {keyof typeof StateIcons} */ (key)];
    if (!icon) return;

    const size = Number(host.dataset.lucideSize) || 20;
    const spin = host.dataset.lucideSpin === 'true';

    host.replaceChildren(
      createLucideIconElement(icon, {
        width: size,
        height: size,
        strokeWidth: host.dataset.lucideStroke ? Number(host.dataset.lucideStroke) : 2,
        spin,
      })
    );
  });
}
