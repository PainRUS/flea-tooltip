import React from "react";
import { useHookstate } from "@hookstate/core";
import { TOOLTIP_ITEM } from "../state/tooltipItem";

export default function TooltipFleaLevel() {
  const tooltipItem = useHookstate(TOOLTIP_ITEM);
  const item = tooltipItem.get();

  if (!item?.availableOnFleaMarket) {
    return null;
  }

  const level = item.fleaMarketMinLevel;
  if (typeof level !== "number" || !Number.isFinite(level) || level <= 0) {
    return null;
  }

  return (
    <style>{`
      #tooltip-card-layer > div > div:nth-child(2) > span.tracking-wider:first-of-type::after {
        content: " Lv. ${Math.round(level)}";
        margin-left: 4px;
        color: #57534e !important;
        font-family: 'Bender';
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.02em;
      }
    `}</style>
  );
}
