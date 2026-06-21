import * as XLSX from 'xlsx';

/**
 * @param {Array<{ name: string; headers: string[]; rows: Array<Array<string | number>> }>} sheets
 * @param {string} filename
 */
export function downloadExcel(sheets, filename) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }

  XLSX.writeFile(workbook, filename);
}

/**
 * @param {import('firebase/firestore').Timestamp | Date | string | undefined} value
 * @returns {string}
 */
export function formatShortDate(value) {
  if (!value) return '—';

  /** @type {Date | null} */
  let date = null;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    typeof /** @type {{ seconds: unknown }} */ (value).seconds === 'number'
  ) {
    date = new Date(/** @type {{ seconds: number }} */ (value).seconds * 1000);
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * @param {'month' | 'quarter' | 'year' | 'all'} period
 * @returns {{ start: number; end: number; label: string }}
 */
export function resolvePeriodRange(period) {
  const now = new Date();
  const end = now.getTime();

  if (period === 'all') {
    return { start: 0, end, label: 'Todo el historial' };
  }

  if (period === 'year') {
    const startDate = new Date(now.getFullYear(), 0, 1);
    return { start: startDate.getTime(), end, label: `Año ${now.getFullYear()}` };
  }

  if (period === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
    return { start: startDate.getTime(), end, label: 'Trimestre actual' };
  }

  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: startDate.getTime(), end, label: 'Mes actual' };
}
