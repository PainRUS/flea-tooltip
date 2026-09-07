import React, { useEffect, useState } from "react";
import { useHookstate } from "@hookstate/core";
import { TOOLTIP_ITEM } from "../state/tooltipItem";
import {
  DEFAULT_PRICE_COLORS,
  DEFAULT_PRICE_COLOR_THRESHOLDS,
  getPriceColor,
  normalizePriceColors,
  normalizePriceColorThresholds,
} from "../../utils";

export default function TooltipPriceColors() {
  const tooltipItem = useHookstate(TOOLTIP_ITEM);
  const item = tooltipItem.get();
  const [enabled, setEnabled] = useState(true);
  const [thresholds, setThresholds] = useState<number[]>([
    ...DEFAULT_PRICE_COLOR_THRESHOLDS,
  ]);
  const [colors, setColors] = useState<string[]>([...DEFAULT_PRICE_COLORS]);

  const applyConfig = (config: any) => {
    setEnabled(config.priceColorsEnabled ?? true);
    setThresholds(normalizePriceColorThresholds(config.priceColorThresholds));
    setColors(normalizePriceColors(config.priceColors));
  };

  useEffect(() => {
    window.electron
      .getUserConfig()
      .then(applyConfig)
      .catch((error) =>
        console.error("Failed to load tooltip price colors:", error)
      );

    window.electron.onConfigChanged(applyConfig);
  }, []);

  if (!enabled || !item) {
    return null;
  }

  const slots = Math.max(1, item.slots || 1);
  const fleaPricePerSlot = Math.ceil((item.prices.avgDay || 0) / slots);
  const traderPricePerSlot =
    item.prices?.trader?.price > 0
      ? Math.ceil(item.prices.trader.price / slots)
      : 0;

  const fleaColor = getPriceColor(
    fleaPricePerSlot,
    true,
    thresholds,
    colors
  );
  const traderColor = getPriceColor(
    traderPricePerSlot,
    true,
    thresholds,
    colors
  );

  return (
    <style>{`
      #tooltip-card-layer > div > div:nth-child(2) .tracking-wider {
        color: ${fleaColor ?? "inherit"} !important;
      }
      #tooltip-card-layer > div > div:nth-child(3) .tracking-wider {
        color: ${traderColor ?? "inherit"} !important;
      }
    `}</style>
  );
}