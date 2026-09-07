import Item from "./models/Item";

export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
