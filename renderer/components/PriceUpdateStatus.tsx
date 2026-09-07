import { useEffect, useRef, useState } from "react";
import { PRICE_MAX_AGE_MS } from "../../utils";
import { AppLanguage } from "../../models/UserConfig";
import { PRICE_LIST } from "../state/priceList";

type PriceStatus = {
  language: AppLanguage;
  lastPriceUpdateAt: number | null;
  nextPriceUpdateAt: number | null;
  priceUpdateFailed: boolean;
};

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export default function PriceUpdateStatus() {
  const [status, setStatus] = useState<PriceStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastAppliedPriceUpdateRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    const syncVisiblePriceList = async (lastPriceUpdateAt: number | null) => {
      if (
        !lastPriceUpdateAt ||
        lastAppliedPriceUpdateRef.current === lastPriceUpdateAt
      ) {
        return;
      }

      try {
        const latestItems = await window.electron.getAllItems();
        if (disposed || !Array.isArray(latestItems) || latestItems.length === 0) {
          return;
        }

        const latestById = new Map(
          latestItems.map((item: any) => [item.id, item] as const)
        );

        PRICE_LIST.set((currentItems) =>
          currentItems.map((currentItem) => {
            const freshItem: any = latestById.get(currentItem.id);
            if (!freshItem) {
              return currentItem;
            }

            return {
              ...currentItem,
              availableOnFleaMarket: freshItem.availableOnFleaMarket,
              prices: freshItem.prices,
              slots: freshItem.slots,
            };
          })
        );
        lastAppliedPriceUpdateRef.current = lastPriceUpdateAt;
      } catch (error) {
        console.error("Failed to sync refreshed prices into visible list:", error);
      }
    };

    const refreshStatus = async () => {
      try {
        const config = await window.electron.getUserConfig();
        if (disposed) return;

        const lastPriceUpdateAt =
          typeof config.lastPriceUpdateAt === "number"
            ? config.lastPriceUpdateAt
            : null;

        setStatus({
          language: config.language ?? "en",
          lastPriceUpdateAt,
          nextPriceUpdateAt:
            typeof config.nextPriceUpdateAt === "number"
              ? config.nextPriceUpdateAt
              : null,
          priceUpdateFailed: config.priceUpdateFailed ?? false,
        });

        void syncVisiblePriceList(lastPriceUpdateAt);
      } catch (error) {
        console.error("Failed to read price update status:", error);
      }
    };

    void refreshStatus();
    const statusTimer = setInterval(() => {
      void refreshStatus();
    }, 5000);
    const clockTimer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(statusTimer);
      clearInterval(clockTimer);
    };
  }, []);

  if (!status) {
    return null;
  }

  const isRussian = status.language === "ru";
  const expired =
    status.lastPriceUpdateAt !== null &&
    now - status.lastPriceUpdateAt >= PRICE_MAX_AGE_MS;
  const failed = status.priceUpdateFailed || expired;
  const formatTime = (timestamp: number) =>
    new Intl.DateTimeFormat(isRussian ? "ru-RU" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(timestamp));

  if (failed) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center px-6 text-center bg-white text-red-800">
        <div className="text-base font-bold mb-1">
          {isRussian ? "Не удалось обновить цены" : "Failed to update prices"}
        </div>
        <div className="text-sm">
          {isRussian
            ? "Актуальные данные о ценах недоступны."
            : "Current price data is unavailable."}
        </div>
        {status.lastPriceUpdateAt && (
          <div className="text-xs mt-2 text-stone-600">
            {isRussian
              ? `Последнее успешное обновление: ${formatTime(status.lastPriceUpdateAt)}`
              : `Last successful update: ${formatTime(status.lastPriceUpdateAt)}`}
          </div>
        )}
      </div>
    );
  }

  if (!status.lastPriceUpdateAt) {
    return null;
  }

  const lastUpdated = formatTime(status.lastPriceUpdateAt);
  const countdown = status.nextPriceUpdateAt
    ? formatCountdown(status.nextPriceUpdateAt - now)
    : "--:--";

  return (
    <div className="shrink-0 px-2 py-1 text-center text-[11px] text-stone-600 bg-stone-100 border-b border-stone-200 whitespace-nowrap">
      {isRussian
        ? `Цены обновлены: ${lastUpdated} · следующее обновление через ${countdown}`
        : `Prices updated: ${lastUpdated} · next update in ${countdown}`}
    </div>
  );
}
