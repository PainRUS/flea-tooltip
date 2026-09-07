const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getItemsPricePerSlot,
  isItemPriceFresh,
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
