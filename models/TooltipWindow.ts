import { BrowserWindow, Rectangle, screen } from "electron";

declare const TOOLTIP_WINDOW_WEBPACK_ENTRY: string;
declare const TOOLTIP_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export default class TooltipWindow extends BrowserWindow {
  private requestedPosition = { x: 0, y: 0 };
  private layoutGeneration = 0;
  private readonly cursorGap = 13;

  constructor() {
    super({
      frame: false,
      transparent: true,
      width: 1,
      height: 1,
      x: 0,
      y: 0,
      backgroundColor: "#00000000",
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        preload: TOOLTIP_WINDOW_PRELOAD_WEBPACK_ENTRY,
      },
    });

    this.loadURL(TOOLTIP_WINDOW_WEBPACK_ENTRY);
  }

  setPosition(x: number, y: number, animate?: boolean): void {
    this.requestedPosition = { x, y };
    super.setPosition(x, y, animate);
  }

  setBounds(bounds: Partial<Rectangle>, animate?: boolean): void {
    const generation = ++this.layoutGeneration;
    super.setBounds(bounds, animate);

    // OCRProcess opens the tooltip with a temporary 500x500 transparent
    // viewport. Measure the actual rendered price card and then resize/move
    // this window so the visible card stays next to the cursor without ever
    // crossing the current monitor edge.
    if (bounds.width !== 500 || bounds.height !== 500) {
      return;
    }

    setTimeout(() => {
      void this.fitRenderedTooltipToScreen(generation);
    }, 0);
  }

  private async fitRenderedTooltipToScreen(generation: number): Promise<void> {
    if (this.isDestroyed() || this.webContents.isDestroyed()) {
      return;
    }

    try {
      const measured = (await this.webContents.executeJavaScript(`
        (() => {
          const root = document.getElementById("root");
          if (!root) return null;

          const rects = Array.from(root.children)
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0);

          if (rects.length === 0) return null;

          const left = Math.min(...rects.map((rect) => rect.left));
          const top = Math.min(...rects.map((rect) => rect.top));
          const right = Math.max(...rects.map((rect) => rect.right));
          const bottom = Math.max(...rects.map((rect) => rect.bottom));

          return {
            width: Math.ceil(right - left),
            height: Math.ceil(bottom - top),
          };
        })()
      `)) as { width: number; height: number } | null;

      if (
        generation !== this.layoutGeneration ||
        !measured ||
        measured.width <= 0 ||
        measured.height <= 0
      ) {
        return;
      }

      const anchor = {
        x: this.requestedPosition.x - this.cursorGap,
        y: this.requestedPosition.y - this.cursorGap,
      };
      const display = screen.getDisplayNearestPoint(anchor);
      const displayBounds = display.bounds;

      const tooltipWidth = Math.max(
        1,
        Math.min(Math.ceil(measured.width) + 2, displayBounds.width)
      );
      const tooltipHeight = Math.max(
        1,
        Math.min(Math.ceil(measured.height) + 2, displayBounds.height)
      );

      const rightEdge = displayBounds.x + displayBounds.width;
      const bottomEdge = displayBounds.y + displayBounds.height;

      let x = this.requestedPosition.x;
      let y = this.requestedPosition.y;

      // Prefer the old placement: below and to the right of the cursor. If the
      // card would cross an edge, flip it to the opposite side of the cursor.
      if (x + tooltipWidth > rightEdge) {
        x = anchor.x - this.cursorGap - tooltipWidth;
      }
      if (y + tooltipHeight > bottomEdge) {
        y = anchor.y - this.cursorGap - tooltipHeight;
      }

      // Final clamp also covers the left/top edges and unusually large cards.
      x = Math.max(
        displayBounds.x,
        Math.min(x, rightEdge - tooltipWidth)
      );
      y = Math.max(
        displayBounds.y,
        Math.min(y, bottomEdge - tooltipHeight)
      );

      if (generation !== this.layoutGeneration || this.isDestroyed()) {
        return;
      }

      super.setBounds({
        x,
        y,
        width: tooltipWidth,
        height: tooltipHeight,
      });
    } catch (error) {
      // Keep the original 500x500 behavior as a safe fallback if renderer
      // measurement is temporarily unavailable while the tooltip is updating.
      console.error("Failed to fit tooltip to screen:", error);
    }
  }
}
