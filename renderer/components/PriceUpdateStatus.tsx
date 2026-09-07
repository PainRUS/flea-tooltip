import { useEffect, useState } from "react";
import { PRICE_MAX_AGE_MS } from "../../utils";
import { AppLanguage } from "../../models/UserConfig";

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

  useEffect(() => {
    let disposed = false;

    const refreshStatus = async () => {
      try {
        const config = await window.electron.getUserConfig();
        if (disposed) return;

        setStatus({
          language: config.language ?? "en",
          lastPriceUpdateAt:
            typeof config.lastPriceUpdateAt === "number"
              ? config.lastPriceUpdateAt
              : null,
          nextPriceUpdateAt:
            typeof config.nextPriceUpdateAt === "number"
              ? config.nextPriceUpdateAt
              : null,
          priceUpdateFailed: config.priceUpdateFailed ?? false,
        });
        setNow(Date.now());
      } catch (error) {
        console.error("Failed to read price update status:", error);
      }
    };

    void refreshStatus();
    const timer = setInterval(() => {
      setNow(Date.now());
      void refreshStatus();
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(timer);
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

  if (failed) {
    return (
      <div className="shrink-0 px-2 py-1 text-center text-xs font-bold bg-red-100 text-red-800 border-b border-red-300">
        {isRussian
          ? "Не удалось обновить цены. Актуальные данные недоступны."
          : "Failed to update prices. Current price data is unavailable."}
      </div>
    );
  }

  if (!status.lastPriceUpdateAt) {
    return null;
  }

  const lastUpdated = new Intl.DateTimeFormat(isRussian ? "ru-RU" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(status.lastPriceUpdateAt));

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
