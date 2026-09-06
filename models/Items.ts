import Item, { ItemTask } from "./Item";
import MiniSearch, { SearchResult } from "minisearch";
import TarkovMarketItem from "./TarkovMarketItem";
import { Form } from "react-router-dom/dist";
import fs from "fs";
import path from "path";
import { app } from "electron";
import { isDev } from "../utils";

export default class Items {
  items: Item[];
  searchIndex: MiniSearch;

  constructor() {
    this.items = [];
  }

  async fetchItems(apiKey?: string, usePveMode?: boolean): Promise<void> {
    const tarkovMarketApiKey = apiKey || "";

    // Clear existing items when refetching
    this.items = [];

    try {
      if (tarkovMarketApiKey.trim() !== "") {
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

        if (!(res.status == 200 || res.status == 204)) {
          throw new Error("Failed to fetch items");
        }

        const data: TarkovMarketItem[] = await res.json();
        const formattedData: Item[] = data.map((item: TarkovMarketItem) => {
          return {
            id: item.uid,
            name: item.name,
            shortName: item.shortName,
            availableOnFleaMarket: !item.bannedOnFlea,
            slots: item.slots,
            prices: {
              latest: item.price,
              avgDay: item.avg24hPrice,
              avgWeek: item.avg7daysPrice,
              trader: {
                name: item.traderName,
                price: item.traderPriceRub,
              },
            },
            tasks: [] as ItemTask[],
            icon: item.icon,
          };
        });

        this.items = formattedData;
      } else {
        console.log("No API key provided, fetching items from Tarkov.dev JSON API");
        const itemsFromApi = await this.getItemsPromise(usePveMode);
        console.log(itemsFromApi.length + " items fetched from API");
        this.items = itemsFromApi;
      }
    } catch (error) {
      console.error("Failed to fetch items:", error);

      // If we don't have an API key, Tarkov.dev was already attempted above.
      if (tarkovMarketApiKey.trim() === "") {
        throw new Error("Failed to fetch items from API");
      }

      // Try Tarkov.dev as fallback when Tarkov Market API fails.
      try {
        console.log("Falling back to Tarkov.dev JSON API");
        const itemsFromApi = await this.getItemsPromise(usePveMode);
        console.log(itemsFromApi.length + " items fetched from API");
        this.items = itemsFromApi;
      } catch (fallbackError) {
        console.error(
          "Failed to fetch items from Tarkov.dev API:",
          fallbackError
        );
        throw new Error("Failed to fetch items from API");
      }
    }
  }

  async getItemsPromise(usePveMode?: boolean): Promise<Item[]> {
    const gameMode = usePveMode ? "pve" : "regular";
    const baseUrl = `https://json.tarkov.dev/${gameMode}`;

    const [itemsResponse, translationsResponse] = await Promise.all([
      fetch(`${baseUrl}/items`, {
        headers: { Accept: "application/json" },
      }),
      fetch(`${baseUrl}/items_en`, {
        headers: { Accept: "application/json" },
      }),
    ]);

    if (!itemsResponse.ok) {
      throw new Error(
        `Tarkov.dev items request failed with status ${itemsResponse.status}`
      );
    }

    if (!translationsResponse.ok) {
      throw new Error(
        `Tarkov.dev translations request failed with status ${translationsResponse.status}`
      );
    }

    const itemsPayload: any = await itemsResponse.json();
    const translationsPayload: any = await translationsResponse.json();

    if (!itemsPayload?.data?.items) {
      throw new Error("Unexpected Tarkov.dev items response");
    }

    const itemTranslations = translationsPayload?.data || {};
    const translate = (value: any, translations: any): string => {
      if (typeof value !== "string") {
        return "";
      }

      const translated = translations[value];
      return typeof translated === "string" ? translated : value;
    };

    // Trader names are kept in a separate static endpoint. Failure to load
    // them should not prevent item prices from working.
    const traderNames: { [id: string]: string } = {};
    try {
      const [tradersResponse, traderTranslationsResponse] = await Promise.all([
        fetch(`${baseUrl}/traders`, {
          headers: { Accept: "application/json" },
        }),
        fetch(`${baseUrl}/traders_en`, {
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

    const itemMap = itemsPayload.data.items;
    const itemData: any[] = Array.isArray(itemMap)
      ? itemMap
      : Object.keys(itemMap).map((id) => itemMap[id]);

    const formattedData: Item[] = itemData.map((item: any) => {
      const lastLowPrice =
        typeof item.lastLowPrice === "number" ? item.lastLowPrice : 0;
      const avg24hPrice =
        typeof item.avg24hPrice === "number" ? item.avg24hPrice : 0;
      const types = Array.isArray(item.types) ? item.types : [];
      const traderPrices = Array.isArray(item.sellToTrader)
        ? item.sellToTrader
        : [];

      const trader = traderPrices
        .map((price: any) => {
          return {
            name: traderNames[price.trader] || "Trader",
            price:
              typeof price.priceRUB === "number"
                ? price.priceRUB
                : typeof price.price === "number"
                  ? price.price
                  : 0,
          };
        })
        .sort(
          (a: { price: number }, b: { price: number }) => b.price - a.price
        )[0] || {
        name: "N/A",
        price: 0,
      };

      return {
        id: item.id,
        name: translate(item.name, itemTranslations),
        shortName: translate(item.shortName, itemTranslations),
        availableOnFleaMarket:
          !types.includes("noFlea") &&
          (lastLowPrice > 0 || avg24hPrice > 0),
        prices: {
          latest: lastLowPrice || avg24hPrice,
          avgDay: avg24hPrice || lastLowPrice,
          avgWeek: avg24hPrice || lastLowPrice,
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
      fields: ["name", "shortName"], // fields to index for full-text search
      searchOptions: {
        fuzzy: 0.2,
        prefix: true,
        boost: {
          shortName: 1.5,
        },
      },
    });

    this.searchIndex.addAll(this.items);
  }

  search(searchQuery: string, lowestAcceptableScore = 0): Item {
    const searchResults = this.searchIndex.search(searchQuery);

    if (!searchResults || searchResults.length === 0) {
      return null;
    }

    const topResult: SearchResult = searchResults[0];
    const item = this.getItemById(topResult.id);

    console.log(
      `Search for "${searchQuery}" returned top result: "${item.name}" with score ${topResult.score} with a max score of ${lowestAcceptableScore}`
    );
    if (
      topResult.score <= lowestAcceptableScore &&
      searchQuery.trim().toLowerCase() !== item.name.trim().toLowerCase()
    ) {
      return null;
    }

    return item;
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
    if (!this.items || this.items.length === 0) {
      return false;
    }

    return true;
  }
}
