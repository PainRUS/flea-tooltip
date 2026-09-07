const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_PRICE_COLORS,
  getItemsPricePerSlot,
  getPriceColor,
  isItemPriceFresh,
  normalizePriceColorThresholds,
  PRICE_MAX_AGE_MS,
} = require("../utils");

function makeItem({ avg24hPrice, latest = 1, slots = 1, updatedAt = Date.now() }) {
  return {
    id: "test-item",
    name: "Test item",
    shortName: "Test",
    searchName: "Test item",
    searchShortName: "Test",
    availableOnFleaMarket: true,
    prices: {
      latest,
      avgDay: avg24hPrice,
      avgWeek: avg24hPrice,
      updatedAt,
      trader: { name: "Trader", price: 0 },
    },
    slots,
    tasks: [],
    icon: "",
  };
}

test("price per slot uses avg24hPrice instead of the old lower latest price", () => {
  const item = makeItem({ avg24hPrice: 120000, latest: 1000, slots: 2 });

  assert.equal(getItemsPricePerSlot(item), 60000);
});

test("price snapshot remains valid before the 24 hour limit", () => {
  const now = Date.now();
  const item = makeItem({
    avg24hPrice: 50000,
    updatedAt: now - PRICE_MAX_AGE_MS + 1000,
  });

  assert.equal(isItemPriceFresh(item, now), true);
});

test("price snapshot is invalid at 24 hours and is not used", () => {
  const now = Date.now();
  const item = makeItem({
    avg24hPrice: 50000,
    updatedAt: now - PRICE_MAX_AGE_MS,
  });

  assert.equal(isItemPriceFresh(item, now), false);
  assert.equal(getItemsPricePerSlot(item), 0);
});

test("default price colors switch exactly at configured RUB-per-slot thresholds", () => {
  assert.equal(getPriceColor(19999), DEFAULT_PRICE_COLORS[0]);
  assert.equal(getPriceColor(20000), DEFAULT_PRICE_COLORS[1]);
  assert.equal(getPriceColor(50000), DEFAULT_PRICE_COLORS[2]);
  assert.equal(getPriceColor(100000), DEFAULT_PRICE_COLORS[3]);
  assert.equal(getPriceColor(250000), DEFAULT_PRICE_COLORS[4]);
});

test("custom thresholds and colors are honored", () => {
  const thresholds = [10000, 20000, 30000, 40000];
  const colors = ["#111111", "#222222", "#333333", "#444444", "#555555"];

  assert.equal(getPriceColor(25000, true, thresholds, colors), "#333333");
  assert.equal(getPriceColor(999999, true, thresholds, colors), "#555555");
  assert.equal(getPriceColor(25000, false, thresholds, colors), undefined);
});

test("price thresholds are normalized to four ascending non-negative values", () => {
  assert.deepEqual(
    normalizePriceColorThresholds([50000, -1, 20000, 100000]),
    [0, 20000, 50000, 100000]
  );
});