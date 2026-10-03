export const ACTION_BAR_PAGE_SIZE = 10;
export const ACTION_BAR_PAGE_COUNT = 5;
export const ACTION_BAR_SLOT_COUNT = ACTION_BAR_PAGE_SIZE * ACTION_BAR_PAGE_COUNT;

export function actionBarPage(value) {
  return Number.isInteger(value) && value >= 1 && value <= ACTION_BAR_PAGE_COUNT ? value : 1;
}

export function cycleActionBarPage(page, direction) {
  return ((actionBarPage(page) - 1 + Math.sign(direction) + ACTION_BAR_PAGE_COUNT) % ACTION_BAR_PAGE_COUNT) + 1;
}

// Measure the actual Scene pane. Ten 44px targets, gaps, paging and padding.
export function actionBarColumns(width) {
  if (!Number.isFinite(width) || width <= 0) return 5;
  if (width >= 640) return 10;
  // A small Tablet Split can be narrower than a phone: reserve 20px outside
  // the bar, 40px for paging, 14px for padding/border and an 8px grid gap.
  return Math.max(1, Math.min(5, Math.floor((width - 78) / 48)));
}
