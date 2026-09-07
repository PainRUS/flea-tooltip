import Item, { ItemTask } from "./Item";
import MiniSearch, { SearchResult } from "minisearch";
import TarkovMarketItem from "./TarkovMarketItem";
import { AppLanguage } from "./UserConfig";
import {
  getUserConfigData,
  setUserConfigData,
} from "../main/services/config";
import {
  isPriceCacheFresh,
  loadPriceCache,
  PRICE_MAX_AGE_MS,
  PRICE_REFRESH_INTERVAL_MS,
  savePriceCache,
} from "../main/services/priceCache";

export default class Items {
  items: Item[];
  searchIndex: MiniSearch;
  private activeLanguage: AppLanguage = "en";
  private activePveMode = false;
  private priceRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private lastNetworkAttemptAt = 0;
  private refreshInFlight: Promise<void> | null = null;
  private readonly duplicateRefreshCooldownMs = 30 * 1000;
  private traderNames: Record<string, string> = {};

  constructor() {
    this.items = [];
  }

  private updatePriceRefreshStatus(
    lastPriceUpdateAt: number | null,
    nextPriceUpdateAt: number | null,
    priceUpdateFailed: boolean
  ): void {
    try {
      const config = getUserConfigData();
      config.lastPriceUpdateAt = lastPriceUpdateAt;
      config.nextPriceUpdateAt = nextPriceUpdateAt;
      config.priceUpdateFailed = priceUpdateFailed;
      setUserConfigData(config);
    } catch (error) {
      console.warn("Failed to persist price refresh status:", error);
    }
  }

  private getLastPriceUpdateAt(): number | null {
    const itemTimestamp = this.items[0]?.prices?.updatedAt;
    if (typeof itemTimestamp === "number" && itemTimestamp > 0) {
      return itemTimestamp;
    }

    try {
      const configTimestamp = getUserConfigData().lastPriceUpdateAt;
      return typeof configTimestamp === "number" ? configTimestamp : null;
    } catch {
      return null;
    }
  }

  private ensurePriceRefreshTimer(): void {
    if (this.priceRefreshTimer) {
      return;
    }

    this.priceRefreshTimer = setInterval(() => {
      const config = getUserConfigData();
      void this.fetchItems(
        config.tarkovMarketApiKey,
        config.usePveMode,
        config.language
      ).catch((error) => {
        console.error("Scheduled price refresh failed:", error);
      });
    }, PRICE_REFRESH_INTERVAL_MS);
  }

  private stampPriceSnapshot(items: Item[], updatedAt: number): void {
    for (const item of items) {
      if (item?.prices) {
        item.prices.updatedAt = updatedAt;
      }
    }
  }

  private rememberTraderNames(items: Item[]): void {
    for (const item of items) {
      const traderId = item?.prices?.trader?.traderId;
      const traderName = item?.prices?.trader?.name;
      if (traderId && traderName) {
        this.traderNames[traderId] = traderName;
      }
    }
  }

  private commitFreshItems(
    freshItems: Item[],
    updatedAt: number,
    usePveMode: boolean,
    language: AppLanguage,
    sameCatalog: boolean
  ): void {
    this.stampPriceSnapshot(freshItems, updatedAt);

    if (sameCatalog && this.itemsAreLoaded()) {
      const existingById = new Map(
        this.items.map((item) => [item.id, item] as const)
      );

      this.items = freshItems.map((freshItem) => {
        const existingItem = existingById.get(freshItem.id);
        if (!existingItem) {
          return freshItem;
        }

        // Preserve the price object reference so already scanned ClientItems in
        // the main window immediately see refreshed prices as well.
        const existingPrices = existingItem.prices;
        Object.assign(existingItem, freshItem);
        Object.assign(existingPrices, freshItem.prices);
        existingItem.prices = existingPrices;
        return existingItem;
      });
    } else {
      this.items = freshItems;
    }

    this.activeLanguage = language;
    this.activePveMode = usePveMode;
    this.rememberTraderNames(this.items);

    savePriceCache(this.items, updatedAt, usePveMode, language);
    this.updatePriceRefreshStatus(
      updatedAt,
      Date.now() + PRICE_REFRESH_INTERVAL_MS,
      false
    );
    this.ensurePriceRefreshTimer();
  }

  private handleRefreshFailure(
    usePveMode: boolean,
    language: AppLanguage
  ): boolean {
    const now = Date.now();
    const currentCatalogMatches =
      this.itemsAreLoaded() &&
      this.activePveMode === usePveMode &&
      this.activeLanguage === language;

    if (!currentCatalogMatches) {
      const cache = loadPriceCache(usePveMode, language);
      if (cache && isPriceCacheFresh(cache, now)) {
        this.stampPriceSnapshot(cache.items, cache.updatedAt);
        this.items = cache.items;
        this.activeLanguage = language;
        this.activePveMode = usePveMode;
        this.rememberTraderNames(this.items);
        this.updatePriceRefreshStatus(
          cache.updatedAt,
          now + PRICE_REFRESH_INTERVAL_MS,
          false
        );
        this.ensurePriceRefreshTimer();
        console.warn(
          `Using cached price snapshot from ${new Date(cache.updatedAt).toISOString()}`
        );
        return true;
      }

      this.updatePriceRefreshStatus(cache?.updatedAt ?? null, null, true);
      return false;
    }

    const lastPriceUpdateAt = this.getLastPriceUpdateAt();
    const priceUpdateFailed =
      !lastPriceUpdateAt || now - lastPriceUpdateAt >= PRICE_MAX_AGE_MS;

    // Keep the last successful snapshot in memory. Its per-item timestamp makes
    // it automatically invalid once it reaches the 24 hour limit.
    this.updatePriceRefreshStatus(
      lastPriceUpdateAt,
      now + PRICE_REFRESH_INTERVAL_MS,
      priceUpdateFailed
    );
    this.ensurePriceRefreshTimer();
    return true;
  }

  private validatePriceRefreshCoverage(matchedItems: number): void {
    const minimumExpected = Math.max(
      1,
      Math.floor(this.items.length * 0.8)
    );
    if (matchedItems < minimumExpected) {
      throw new Error(
        `Price refresh matched only ${matchedItems}/${this.items.length} items`
      );
    }
  }

  private async refreshPricesOnly(
    apiKey: string | undefined,
    usePveMode: boolean,
    language: AppLanguage
  ): Promise<void> {
    this.lastNetworkAttemptAt = Date.now();
    const updatedAt = Date.now();
    const tarkovMarketApiKey = apiKey || "";

    try {
      if (tarkovMarketApiKey.trim() !== "" && language === "en") {
        const tarkovMarketUrl = usePveMode
          ? "https://api.tarkov-market.app/api/v1/pve/items/all"
          : "https://api.tarkov-market.app/api/v1/items/all";
        const response = await fetch(tarkovMarketUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": tarkovMarketApiKey,
          },
        });

        if (!(response.status === 200 || response.status === 204)) {
          throw new Error(
            `Tarkov Market price refresh failed with status ${response.status}`
          );
        }

        const data: TarkovMarketItem[] = await response.json();
        const byId = new Map(data.map((item) => [item.uid, item] as const));
        const matchedItems = this.items.filter((item) => byId.has(item.id)).length;
        this.validatePriceRefreshCoverage(matchedItems);

        for (const item of this.items) {
          const source = byId.get(item.id);
          if (!source) continue;

          const avg24hPrice = source.avg24hPrice || 0;
          item.availableOnFleaMarket =
            !source.bannedOnFlea && avg24hPrice > 0;
          item.prices.latest = avg24hPrice;
          item.prices.avgDay = avg24hPrice;
          item.prices.avgWeek = avg24hPrice;
          item.prices.updatedAt = updatedAt;
          item.prices.trader.name = source.traderName;
          item.prices.trader.price = source.traderPriceRub;
          item.prices.trader.traderId = undefined;
        }
      } else {
        // The five-minute refresh is intentionally one full /items request.
        // Names, translations and trader metadata are loaded only on startup.
        const gameMode = usePveMode ? "pve" : "regular";
        const response = await fetch(`https://json.tarkov.dev/${gameMode}/items`, {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(
            `Tarkov.dev price refresh failed with status ${response.status}`
          );
        }

        const payload: any = await response.json();
        if (!payload?.data?.items) {
          throw new Error("Unexpected Tarkov.dev price refresh response");
        }

        const rawItems = Array.isArray(payload.data.items)
          ? payload.data.items
          : Object.keys(payload.data.items).map(
              (id) => payload.data.items[id]
            );
        const byId = new Map(rawItems.map((item: any) => [item.id, item] as const));
        const matchedItems = this.items.filter((item) => byId.has(item.id)).length;
        this.validatePriceRefreshCoverage(matchedItems);

        for (const item of this.items) {
          const source: any = byId.get(item.id);
          if (!source) continue;

          const avg24hPrice =
            typeof source.avg24hPrice === "number" ? source.avg24hPrice : 0;
          const types = Array.isArray(source.types) ? source.types : [];
          const traderPrices = Array.isArray(source.sellToTrader)
            ? source.sellToTrader
            : [];
          const bestTrader = traderPrices
            .map((price: any) => ({
              traderId: price.trader,
              price:
                typeof price.priceRUB === "number"
                  ? price.priceRUB
                  : typeof price.price === "number"
                    ? price.price
                    : 0,
            }))
            .sort(
              (left: { price: number }, right: { price: number }) =>
                right.price - left.price
            )[0];

          item.availableOnFleaMarket =
            !types.includes("noFlea") && avg24hPrice > 0;
          item.prices.latest = avg24hPrice;
          item.prices.avgDay = avg24hPrice;
          item.prices.avgWeek = avg24hPrice;
          item.prices.updatedAt = updatedAt;

          if (bestTrader) {
            item.prices.trader.traderId = bestTrader.traderId;
            item.prices.trader.price = bestTrader.price;
            item.prices.trader.name =
              this.traderNames[bestTrader.traderId] ||
              item.prices.trader.name ||
              (language === "ru" ? "Торговец" : "Trader");
          } else {
            item.prices.trader.price = 0;
          }
        }
      }

      savePriceCache(this.items, updatedAt, usePveMode, language);
      this.updatePriceRefreshStatus(
        updatedAt,
        Date.now() + PRICE_REFRESH_INTERVAL_MS,
        false
      );
      console.log(
        `Price snapshot refreshed: ${this.items.length} items, next refresh in 5 minutes`
      );
    } catch (error) {
      console.error("Failed to refresh price snapshot:", error);
      if (!this.handleRefreshFailure(usePveMode, language)) {
        throw error;
      }
    }
  }

  async fetchItems(
    apiKey?: string,
    usePveMode?: boolean,
    language?: AppLanguage
  ): Promise<void> {
    const selectedLanguage: AppLanguage =
      language ?? getUserConfigData().language ?? "en";
    const selectedPveMode = !!usePveMode;
    const sameCatalog =
      this.itemsAreLoaded() &&
      this.activeLanguage === selectedLanguage &&
      this.activePveMode === selectedPveMode;

    // The original main process still has a legacy 15-minute refresh timer.
    // Our 5-minute timer aligns with it, so suppress duplicate requests that
    // land within the same short window.
    if (
      sameCatalog &&
      this.lastNetworkAttemptAt > 0 &&
      Date.now() - this.lastNetworkAttemptAt < this.duplicateRefreshCooldownMs
    ) {
      return;
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    if (sameCatalog) {
      this.refreshInFlight = this.refreshPricesOnly(
        apiKey,
        selectedPveMode,
        selectedLanguage
      );
    } else {
      this.refreshInFlight = this.fetchItemsInternal(
        apiKey,
        selectedPveMode,
        selectedLanguage,
        sameCatalog
      );
    }

    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async fetchItemsInternal(
    apiKey: string | undefined,
    usePveMode: boolean,
    selectedLanguage: AppLanguage,
    sameCatalog: boolean
  ): Promise<void> {
    const tarkovMarketApiKey = apiKey || "";
    this.lastNetworkAttemptAt = Date.now();

    let freshItems: Item[] | null = null;
    let lastError: unknown = null;

    try {
      // Tarkov Market returns English names. In Russian mode use Tarkov.dev so
      // OCR/search names and UI names always match the selected game language.
      if (tarkovMarketApiKey.trim() !== "" && selectedLanguage === "en") {
        console.log("Using Tarkov Market API key for item fetch");

        const tarkovMarketUrl = usePveMode
          ? "https://api.tarkov-market.app/api/v1/pve/items/all"
          : "https://api.tarkov-market.app/api/v1/items/all";

        const res = await fetch(tarkovMarketUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": tarkovMarketApiKey,
          },
        });

        if (!(res.status === 200 || res.status === 204)) {
          throw new Error("Failed to fetch items");
        }

        const data: TarkovMarketItem[] = await res.json();
        freshItems = data.map((item: TarkovMarketItem) => ({
          id: item.uid,
          name: item.name,
          shortName: item.shortName,
          searchName: item.name,
          searchShortName: item.shortName,
          availableOnFleaMarket:
            !item.bannedOnFlea && (item.avg24hPrice || 0) > 0,
          slots: item.slots,
          prices: {
            // avg24hPrice is the single authoritative flea value.
            latest: item.avg24hPrice || 0,
            avgDay: item.avg24hPrice || 0,
            avgWeek: item.avg24hPrice || 0,
            trader: {
              name: item.traderName,
              price: item.traderPriceRub,
            },
          },
          tasks: [] as ItemTask[],
          icon: item.icon,
        }));
      } else {
        if (
          tarkovMarketApiKey.trim() !== "" &&
          selectedLanguage === "ru"
        ) {
          console.log(
            "Russian language selected; using Tarkov.dev JSON API for localized item names"
          );
        } else {
          console.log(
            "No API key provided, fetching items from Tarkov.dev JSON API"
          );
        }

        freshItems = await this.getItemsPromise(usePveMode, selectedLanguage);
        console.log(freshItems.length + " items fetched from API");
      }
    } catch (error) {
      lastError = error;
      console.error("Failed to fetch items:", error);

      // Preserve the old keyed English fallback to Tarkov.dev.
      if (
        tarkovMarketApiKey.trim() !== "" &&
        selectedLanguage === "en"
      ) {
        try {
          console.log("Falling back to Tarkov.dev JSON API");
          freshItems = await this.getItemsPromise(
            usePveMode,
            selectedLanguage
          );
          console.log(freshItems.length + " items fetched from API");
        } catch (fallbackError) {
          lastError = fallbackError;
          console.error(
            "Failed to fetch items from Tarkov.dev API:",
            fallbackError
          );
        }
      }
    }

    if (!freshItems || freshItems.length === 0) {
      if (this.handleRefreshFailure(usePveMode, selectedLanguage)) {
        return;
      }

      throw new Error(
        `Failed to fetch items from API${
          lastError instanceof Error ? `: ${lastError.message}` : ""
        }`
      );
    }

    const updatedAt = Date.now();
    this.commitFreshItems(
      freshItems,
      updatedAt,
      usePveMode,
      selectedLanguage,
      sameCatalog
    );
  }

  async getItemsPromise(
    usePveMode?: boolean,
    language: AppLanguage = "en"
  ): Promise<Item[]> {
    const gameMode = usePveMode ? "pve" : "regular";
    const baseUrl = `https://json.tarkov.dev/${gameMode}`;

    const [itemsResponse, selectedTranslationsResponse] = await Promise.all([
      fetch(`${baseUrl}/items`, {
        headers: { Accept: "application/json" },
      }),
      fetch(`${baseUrl}/items_${language}`, {
        headers: { Accept: "application/json" },
      }),
    ]);

    if (!itemsResponse.ok) {
      throw new Error(
        `Tarkov.dev items request failed with status ${itemsResponse.status}`
      );
    }

    if (!selectedTranslationsResponse.ok) {
      throw new Error(
        `Tarkov.dev ${language} translations request failed with status ${selectedTranslationsResponse.status}`
      );
    }

    const itemsPayload: any = await itemsResponse.json();
    const selectedTranslationsPayload: any =
      await selectedTranslationsResponse.json();

    if (!itemsPayload?.data?.items) {
      throw new Error("Unexpected Tarkov.dev items response");
    }

    let englishTranslationsPayload = selectedTranslationsPayload;
    if (language !== "en") {
      const englishTranslationsResponse = await fetch(`${baseUrl}/items_en`, {
        headers: { Accept: "application/json" },
      });

      if (!englishTranslationsResponse.ok) {
        throw new Error(
          `Tarkov.dev English translations request failed with status ${englishTranslationsResponse.status}`
        );
      }

      englishTranslationsPayload = await englishTranslationsResponse.json();
    }

    const selectedTranslations = selectedTranslationsPayload?.data || {};
    const englishTranslations = englishTranslationsPayload?.data || {};

    const translate = (value: any, translations: any): string => {
      if (typeof value !== "string") {
        return "";
      }

      const translated = translations[value];
      return typeof translated === "string" ? translated : value;
    };

    const traderNames: { [id: string]: string } = {};
    try {
      const [tradersResponse, traderTranslationsResponse] = await Promise.all([
        fetch(`${baseUrl}/traders`, {
          headers: { Accept: "application/json" },
        }),
        fetch(`${baseUrl}/traders_${language}`, {
          headers: { Accept: "application/json" },
        }),
      ]);

      if (tradersResponse.ok && traderTranslationsResponse.ok) {
        const tradersPayload: any = await tradersResponse.json();
        const traderTranslationsPayload: any =
          await traderTranslationsResponse.json();
        const traderTranslations = traderTranslationsPayload?.data || {};
        const traders = tradersPayload?.data || {};

        Object.keys(traders).forEach((traderId) => {
          traderNames[traderId] = translate(
            traders[traderId]?.name,
            traderTranslations
          );
        });
      }
    } catch (error) {
      console.warn("Failed to load Tarkov.dev trader names:", error);
    }
    this.traderNames = { ...this.traderNames, ...traderNames };

    const itemMap = itemsPayload.data.items;
    const itemData: any[] = Array.isArray(itemMap)
      ? itemMap
      : Object.keys(itemMap).map((id) => itemMap[id]);

    const formattedData: Item[] = itemData.map((item: any) => {
      const avg24hPrice =
        typeof item.avg24hPrice === "number" ? item.avg24hPrice : 0;
      const types = Array.isArray(item.types) ? item.types : [];
      const traderPrices = Array.isArray(item.sellToTrader)
        ? item.sellToTrader
        : [];

      const trader = traderPrices
        .map((price: any) => ({
          traderId: price.trader,
          name:
            traderNames[price.trader] ||
            (language === "ru" ? "Торговец" : "Trader"),
          price:
            typeof price.priceRUB === "number"
              ? price.priceRUB
              : typeof price.price === "number"
                ? price.price
                : 0,
        }))
        .sort(
          (a: { price: number }, b: { price: number }) => b.price - a.price
        )[0] || {
        traderId: undefined,
        name: language === "ru" ? "Н/Д" : "N/A",
        price: 0,
      };

      const canonicalName = translate(item.name, englishTranslations);
      const selectedName = translate(item.name, selectedTranslations);
      const selectedShortName = translate(item.shortName, selectedTranslations);

      return {
        id: item.id,
        // Keep English full names internally so the existing quest/task table
        // continues to work exactly as before.
        name: canonicalName,
        // UI and OCR use exactly one selected language.
        shortName: selectedShortName,
        searchName: selectedName,
        searchShortName: selectedShortName,
        availableOnFleaMarket:
          !types.includes("noFlea") && avg24hPrice > 0,
        prices: {
          // avg24hPrice is intentionally used for every flea field so legacy
          // renderers cannot accidentally fall back to lastLowPrice.
          latest: avg24hPrice,
          avgDay: avg24hPrice,
          avgWeek: avg24hPrice,
          trader,
        },
        slots: (item.width || 1) * (item.height || 1),
        tasks: [] as ItemTask[],
        icon: item.iconLink || "",
      };
    });

    console.log(formattedData[0]);
    console.log(formattedData.length + " items loaded");
    return formattedData;
  }

  initializeSearchIndex(): void {
    if (!this.itemsAreLoaded()) {
      throw new Error(
        "Can't create search index for items, no items have been loaded"
      );
    }

    this.searchIndex = new MiniSearch({
      fields: ["searchName", "searchShortName"],
      searchOptions: {
        fuzzy: 0.2,
        prefix: true,
        boost: {
          searchShortName: 1.5,
        },
      },
    });

    this.searchIndex.addAll(this.items);
  }

  private tokenizeForRussianOcr(value: string): string[] {
    return value
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((token) =>
        token.replace(/^[^0-9a-zа-яё]+|[^0-9a-zа-яё]+$/gi, "")
      )
      .filter(Boolean);
  }

  private normalizeRussianOcrModel(value: string): string {
    const confusables: { [character: string]: string } = {
      а: "a",
      в: "b",
      с: "c",
      е: "e",
      ё: "e",
      н: "h",
      к: "k",
      м: "m",
      о: "o",
      р: "p",
      т: "t",
      х: "x",
      у: "y",
    };

    return value
      .normalize("NFKC")
      .toLowerCase()
      .split("")
      .map((character) => confusables[character] || character)
      .join("")
      .replace(/[^a-z0-9]/g, "");
  }

  private getNormalizedSimilarity(left: string, right: string): number {
    if (left === right) {
      return 1;
    }
    if (!left || !right) {
      return 0;
    }

    const previous = Array.from({ length: right.length + 1 }, (_, index) =>
      index
    );

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] +
            (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
        );
      }

      for (let index = 0; index < current.length; index++) {
        previous[index] = current[index];
      }
    }

    const distance = previous[right.length];
    return 1 - distance / Math.max(left.length, right.length);
  }

  private searchRussianOcrFallback(searchQuery: string): Item | null {
    const queryTokens = this.tokenizeForRussianOcr(searchQuery);

    // This fallback exists only for mixed Russian + Latin model names. A
    // one-word OCR result does not contain enough structure to use it safely.
    if (queryTokens.length < 2) {
      return null;
    }

    const firstToken = queryTokens[0];
    const candidates: Array<{ item: Item; similarity: number }> = [];

    for (const candidate of this.items) {
      const candidateTokens = this.tokenizeForRussianOcr(candidate.searchName);

      // Keep the fallback deliberately narrow: the Russian leading noun must
      // match exactly, and a shorter generic item such as "Балаклава" must not
      // beat "Балаклава Momex" merely because the first word is perfect.
      if (
        candidateTokens.length < queryTokens.length ||
        candidateTokens[0] !== firstToken ||
        candidateTokens.length - queryTokens.length > 2
      ) {
        continue;
      }

      let commonPrefixLength = 0;
      while (
        commonPrefixLength < queryTokens.length &&
        commonPrefixLength < candidateTokens.length &&
        queryTokens[commonPrefixLength] === candidateTokens[commonPrefixLength]
      ) {
        commonPrefixLength++;
      }

      if (commonPrefixLength < 1) {
        continue;
      }

      const queryModel = this.normalizeRussianOcrModel(
        queryTokens.slice(commonPrefixLength).join("")
      );
      const candidateModel = this.normalizeRussianOcrModel(
        candidateTokens.slice(commonPrefixLength).join("")
      );

      if (!queryModel || !candidateModel) {
        continue;
      }

      candidates.push({
        item: candidate,
        similarity: this.getNormalizedSimilarity(queryModel, candidateModel),
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => right.similarity - left.similarity);
    const best = candidates[0];
    const second = candidates[1];
    const queryModelLength = this.normalizeRussianOcrModel(
      queryTokens.slice(1).join("")
    ).length;
    const minimumSimilarity = queryModelLength >= 5 ? 0.48 : 0.6;
    const minimumLead = 0.08;

    if (
      best.similarity < minimumSimilarity ||
      (second && best.similarity - second.similarity < minimumLead)
    ) {
      console.log(
        `Russian OCR fallback rejected "${searchQuery}": best candidate "${best.item.searchName}" similarity ${best.similarity.toFixed(3)}${
          second
            ? `, second "${second.item.searchName}" ${second.similarity.toFixed(3)}`
            : ""
        }`
      );
      return null;
    }

    console.log(
      `Russian OCR fallback matched "${searchQuery}" to "${best.item.searchName}" with model similarity ${best.similarity.toFixed(3)}`
    );
    return best.item;
  }

  search(searchQuery: string, lowestAcceptableScore = 0): Item {
    const searchResults = this.searchIndex.search(searchQuery);

    if (!searchResults || searchResults.length === 0) {
      return null;
    }

    const topResult: SearchResult = searchResults[0];
    const item = this.getItemById(topResult.id);
    const exactMatch =
      searchQuery.trim().toLowerCase() === item.searchName.trim().toLowerCase();

    console.log(
      `Search for "${searchQuery}" returned top result: "${item.searchName}" with score ${topResult.score}; required minimum ${lowestAcceptableScore}`
    );

    if (topResult.score > lowestAcceptableScore || exactMatch) {
      return item;
    }

    if (this.activeLanguage === "ru") {
      const fallbackItem = this.searchRussianOcrFallback(searchQuery);
      if (fallbackItem) {
        return fallbackItem;
      }
    }

    return null;
  }

  getItemById(id: string): Item {
    if (!this.itemsAreLoaded()) {
      throw new Error("Can't get items, no items have been loaded");
    }

    const itemsMatchedByFilter: Item[] = this.items.filter(
      (item) => item.id === id
    );

    if (itemsMatchedByFilter.length === 0) {
      return null;
    }

    return itemsMatchedByFilter[0];
  }

  itemsAreLoaded(): boolean {
    return !!this.items && this.items.length > 0;
  }
}
