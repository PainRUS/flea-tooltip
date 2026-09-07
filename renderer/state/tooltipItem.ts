/* eslint-disable @typescript-eslint/ban-ts-comment */
import { hookstate } from "@hookstate/core";
import Item from "../../models/Item";
import IpcConstants from "../../models/IpcConstants";
import { isItemPriceFresh } from "../../utils";

export const TOOLTIP_ITEM = hookstate<Item | null>(null);

export async function setTooltipItem(item: Item | null) {
  if (item && !isItemPriceFresh(item)) {
    TOOLTIP_ITEM.set(null);
    return;
  }

  TOOLTIP_ITEM.set(item);
}

// If the app stays open across the 24-hour boundary, stop displaying the old
// snapshot essentially immediately, without waiting for another OCR result.
setInterval(() => {
  const currentItem = TOOLTIP_ITEM.get();
  if (currentItem && !isItemPriceFresh(currentItem as Item)) {
    TOOLTIP_ITEM.set(null);
  }
}, 1000);

// @ts-expect-error
window.electron.receive(
  IpcConstants.NewTooltipItem,
  (event: any, newItem: Item | null) => {
    setTooltipItem(newItem);
  }
);
