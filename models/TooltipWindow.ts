import { BrowserWindow, screen } from "electron";

declare const TOOLTIP_WINDOW_WEBPACK_ENTRY: string;
declare const TOOLTIP_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export default class TooltipWindow extends BrowserWindow {
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

  public hideTooltip(): void {
    this.layoutGeneration++;
    if (!this.isDestroyed()) {
      this.hide();
    }
  }

  public showNearCursor(cursorX: number, cursorY: number): void {
    const generation = ++this.layoutGeneration;
    const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY });
    const bounds = display.bounds;
    const rightEdge = bounds.x + bounds.width;
    const bottomEdge = bounds.y + bounds.height;

    // First make the window visible immediately with the old safe 500x500
    // viewport, but clamp that viewport inside the current monitor. This keeps
    // the price card visible even if DOM measurement is late or unavailable.
    const initialWidth = Math.min(500, bounds.width);
    const initialHeight = Math.min(500, bounds.height);
    let initialX = cursorX + this.cursorGap;
    let initialY = cursorY + this.cursorGap;

    initialX = Math.max(
      bounds.x,
      Math.min(initialX, rightEdge - initialWidth)
    );
    initialY = Math.max(
      bounds.y,
      Math.min(initialY, bottomEdge - initialHeight)
    );

    this.setBounds({
      x: initialX,
      y: initialY,
      width: initialWidth,
      height: initialHeight,
    });
    this.showInactive();

    // React receives the item just before this call. Give it a moment to paint,
    // then shrink the transparent window to the actual white price card and
    // flip the card around the cursor if an edge would otherwise be crossed.
    setTimeout(() => {
      void this.fitRenderedTooltipToScreen(cursorX, cursorY, generation);
    }, 40);
  }

  private async fitRenderedTooltipToScreen(
    cursorX: number,
    cursorY: number,
    generation: number
  ): Promise<void> {
    if (
      generation !== this.layoutGeneration ||
      this.isDestroyed() ||
      this.webContents.isDestroyed()
    ) {
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

      const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY });
      const bounds = display.bounds;
      const rightEdge = bounds.x + bounds.width;
      const bottomEdge = bounds.y + bounds.height;
      const tooltipWidth = Math.max(
        1,
        Math.min(Math.ceil(measured.width) + 2, bounds.width)
      );
      const tooltipHeight = Math.max(
        1,
        Math.min(Math.ceil(measured.height) + 2, bounds.height)
      );

      let x = cursorX + this.cursorGap;
      let y = cursorY + this.cursorGap;

      if (x + tooltipWidth > rightEdge) {
        x = cursorX - this.cursorGap - tooltipWidth;
      }
      if (y + tooltipHeight > bottomEdge) {
        y = cursorY - this.cursorGap - tooltipHeight;
      }

      x = Math.max(bounds.x, Math.min(x, rightEdge - tooltipWidth));
      y = Math.max(bounds.y, Math.min(y, bottomEdge - tooltipHeight));

      if (generation !== this.layoutGeneration || this.isDestroyed()) {
        return;
      }

      this.setBounds({
        x,
        y,
        width: tooltipWidth,
        height: tooltipHeight,
      });
    } catch (error) {
      // The already-visible, clamped 500x500 fallback remains on screen.
      console.error("Failed to fit tooltip to screen:", error);
    }
  }
}
