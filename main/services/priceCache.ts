import { app } from "electron";
import fs from "fs";
import path from "path";
import Item from "../../models/Item";
import { AppLanguage } from "../../models/UserConfig";

export const PRICE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PriceCacheSnapshot = {
  version: 1;
  updatedAt: number;
  usePveMode: boolean;
  language: AppLanguage;
  items: Item[];
};

function getPriceCachePath(): string {
  return path.join(app.getPath("userData"), "price-cache.json");
}

export function loadPriceCache(
  usePveMode: boolean,
  language: AppLanguage
): PriceCacheSnapshot | null {
  try {
    const cachePath = getPriceCachePath();
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const parsed = JSON.parse(
      fs.readFileSync(cachePath, { encoding: "utf-8" })
    ) as PriceCacheSnapshot;

    if (
      parsed?.version !== 1 ||
      parsed.usePveMode !== usePveMode ||
      parsed.language !== language ||
      typeof parsed.updatedAt !== "number" ||
      !Array.isArray(parsed.items) ||
      parsed.items.length === 0
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn("Failed to read price cache:", error);
    return null;
  }
}

export function savePriceCache(
  items: Item[],
  updatedAt: number,
  usePveMode: boolean,
  language: AppLanguage
): void {
  try {
    const userDataPath = app.getPath("userData");
    fs.mkdirSync(userDataPath, { recursive: true });

    const snapshot: PriceCacheSnapshot = {
      version: 1,
      updatedAt,
      usePveMode,
      language,
      items,
    };

    // One snapshot only: each successful refresh replaces the previous file.
    fs.writeFileSync(
      getPriceCachePath(),
      JSON.stringify(snapshot),
      { encoding: "utf-8" }
    );
  } catch (error) {
    // Cache persistence must never make a successful live price refresh fail.
    console.warn("Failed to write price cache:", error);
  }
}

export function isPriceCacheFresh(
  snapshot: PriceCacheSnapshot,
  now = Date.now()
): boolean {
  return now - snapshot.updatedAt < PRICE_MAX_AGE_MS;
}
