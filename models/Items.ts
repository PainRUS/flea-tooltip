import Item, { ItemTask } from "./Item";
import MiniSearch, { SearchResult } from "minisearch";
import TarkovMarketItem from "./TarkovMarketItem";
import { AppLanguage } from "./UserConfig";
import { getUserConfigData } from "../main/services/config";

export default class Items {
  items: Item[];
  searchIndex: MiniSearch;

  constructor() {
    this.items = [];
  }

  async fetchItems(
    apiKey?: string,
    usePveMode?: boolean,
    language?: AppLanguage
  ): Promise<void> {
    const selectedLanguage: AppLanguage =
      language ?? getUserConfigData().language ?? "en";
    const tarkovMarketApiKey = apiKey || "";

    this.items = [];

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
        const formattedData: Item[] = data.map((item: TarkovMarketItem) => ({
          id: item.uid,
          name: item.name,
          shortName: item.shortName,
          searchName: item.name,
          searchShortName: item.shortName,
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
        }));

        this.items = formattedData;
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

        const itemsFromApi = await this.getItemsPromise(
          usePveMode,
          selectedLanguage
        );
        console.log(itemsFromApi.length + " items fetched from API");
        this.items = itemsFromApi;
      }
    } catch (error) {
      console.error("Failed to fetch items:", error);

      if (
        tarkovMarketApiKey.trim() === "" ||
        selectedLanguage === "ru"
      ) {
        throw new Error("Failed to fetch items from API");
      }

      try {
        console.log("Falling back to Tarkov.dev JSON API");
        const itemsFromApi = await this.getItemsPromise(
          usePveMode,
          selectedLanguage
        );
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
        .map((price: any) => ({
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

  search(searchQuery: string, lowestAcceptableScore = 0): Item {
    const searchResults = this.searchIndex.search(searchQuery);

    if (!searchResults || searchResults.length === 0) {
      return null;
    }

    const topResult: SearchResult = searchResults[0];
    const item = this.getItemById(topResult.id);

    console.log(
      `Search for "${searchQuery}" returned top result: "${item.searchName}" with score ${topResult.score} with a max score of ${lowestAcceptableScore}`
    );
    if (
      topResult.score <= lowestAcceptableScore &&
      searchQuery.trim().toLowerCase() !== item.searchName.trim().toLowerCase()
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
    return !!this.items && this.items.length > 0;
  }
}
