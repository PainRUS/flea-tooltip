const test = require("node:test");
const assert = require("node:assert/strict");

const Items = require("../models/Items").default;

function makeItem(searchName, id = searchName) {
  return {
    id,
    name: searchName,
    shortName: searchName,
    searchName,
    searchShortName: searchName,
    availableOnFleaMarket: true,
    prices: {
      latest: 1000,
      avgDay: 1000,
      avgWeek: 1000,
      trader: { name: "Trader", price: 500 },
    },
    slots: 1,
    tasks: [],
    icon: "",
  };
}

function makeCatalog(language, names) {
  const catalog = new Items();
  catalog.items = names.map((name, index) => makeItem(name, `item-${index}`));
  // TypeScript private is compile-time only; tests set the already-existing
  // runtime field so no Electron config or network access is needed.
  catalog.activeLanguage = language;
  catalog.initializeSearchIndex();
  return catalog;
}

test("exact localized name remains authoritative even above the score threshold", () => {
  const catalog = makeCatalog("ru", ["Балаклава Momex", "Объектив NIXXOR"]);

  const result = catalog.search("Балаклава Momex", 100000);

  assert.equal(result?.searchName, "Балаклава Momex");
});

test("Russian OCR fallback repairs NIXXOR when Latin letters are read as Cyrillic", () => {
  const catalog = makeCatalog("ru", [
    "Объектив NIXXOR",
    "Объектив Nightforce ATACR",
    "Прицел ELCAN SpecterDR",
  ]);

  const result = catalog.search("Объектив МХХОВ", 100000);

  assert.equal(result?.searchName, "Объектив NIXXOR");
});

test("Russian OCR fallback prefers Momex over the shorter generic Balaclava item", () => {
  const catalog = makeCatalog("ru", [
    "Балаклава",
    "Балаклава Momex",
    "Балаклава Cold Fear",
  ]);

  const result = catalog.search("Балаклава Мотех", 100000);

  assert.equal(result?.searchName, "Балаклава Momex");
});

test("Russian OCR fallback rejects an ambiguous model correction", () => {
  const catalog = makeCatalog("ru", [
    "Объектив MXXOA",
    "Объектив MXXOC",
    "Объектив NIXXOR",
  ]);

  const result = catalog.search("Объектив МХХОВ", 100000);

  assert.equal(result, null);
});

test("Russian OCR fallback is disabled in English mode", () => {
  const catalog = makeCatalog("en", ["Объектив NIXXOR", "Балаклава Momex"]);

  const result = catalog.search("Объектив МХХОВ", 100000);

  assert.equal(result, null);
});
