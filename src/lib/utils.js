import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format date string to dd-mm-yyyy format
 * @param {string} dateStr - Date string in any format
 * @returns {string} Formatted date in dd-mm-yyyy or original string if parsing fails
 */
export function formatDateDDMMYYYY(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  
  // Handle yyyy-mm-dd format
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
  }
  
  // Handle other formats by parsing and reformatting
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  } catch {
    return dateStr;
  }
}
