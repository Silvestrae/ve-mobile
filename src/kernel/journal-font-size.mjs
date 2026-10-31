export const DEFAULT_JOURNAL_FONT_SIZE = 16;
export const MIN_JOURNAL_FONT_SIZE = 12;
export const MAX_JOURNAL_FONT_SIZE = 30;

export function clampJournalFontSize(value) {
  return Number.isFinite(value) ? Math.round(Math.min(MAX_JOURNAL_FONT_SIZE, Math.max(MIN_JOURNAL_FONT_SIZE, value)) * 10) / 10 : DEFAULT_JOURNAL_FONT_SIZE;
}
