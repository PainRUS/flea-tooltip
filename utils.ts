import Item from "./models/Item";

export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PRICE_COLOR_THRESHOLDS = [
  20000,
  50000,
  100000,
  250000,
];

export const DEFAULT_PRICE_COLORS = [
  "#78716c",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
];

export function normalizePriceColorThresholds(
  thresholds?: number[]
): number[] {
  const normalized = DEFAULT_PRICE_COLOR_THRESHOLDS.map((fallback, index) => {
    const candidate = thresholds?.[index];
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(0, Math.round(candidate))
      : fallback;
  });

  return normalized.sort((left, right) => left - right);
}

export function normalizePriceColors(colors?: string[]): string[] {
  return DEFAULT_PRICE_COLORS.map((fallback, index) => {
    const candidate = colors?.[index];
    return typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate)
      ? candidate.toLowerCase()
      : fallback;
  });
}

export function getPriceColor(
  pricePerSlot: number,
  enabled = true,
  thresholds?: number[],
  colors?: string[]
): string | undefined {
  if (!enabled || !Number.isFinite(pricePerSlot) || pricePerSlot < 0) {
    return undefined;
  }

  const normalizedThresholds = normalizePriceColorThresholds(thresholds);
  const normalizedColors = normalizePriceColors(colors);

  const bandIndex = normalizedThresholds.findIndex(
    (threshold) => pricePerSlot < threshold
  );

  return normalizedColors[
    bandIndex === -1 ? normalizedColors.length - 1 : bandIndex
  ];
}

export function isDev() {
  return process.env["WEBPACK_SERVE"] === "true";
}

export function numberWithCommas(x: number | undefined) {
  if (x === undefined) {
    return x;
  }

  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function isItemPriceFresh(item: Item, now = Date.now()): boolean {
  const updatedAt = item?.prices?.updatedAt;
  return (
    typeof updatedAt === "number" &&
    updatedAt > 0 &&
    now - updatedAt < PRICE_MAX_AGE_MS
  );
}

export function getItemsPricePerSlot(item: Item): number {
  if (!isItemPriceFresh(item)) {
    return 0;
  }

  const fleaPricePerSlot = Math.ceil((item.prices.avgDay || 0) / item.slots);
  let price = fleaPricePerSlot;

  const traderPricePerSlot =
    item?.prices?.trader?.price > 0
      ? Math.ceil(item.prices.trader.price / item.slots)
      : 0;

  if (!item.availableOnFleaMarket || traderPricePerSlot > price) {
    price = traderPricePerSlot;
  }

  return price;
}

export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}