import { BrowserWindow, screen } from "electron";

declare const TOOLTIP_WINDOW_WEBPACK_ENTRY: string;
declare const TOOLTIP_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export default class TooltipWindow extends BrowserWindow {
  private layoutGeneration = 0;
  private readonly cursorGap = 13;
  private lastCursorX = 0;
  private lastCursorY = 0;

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
      // The price popup is an in-game overlay and must stay above Tarkov
      // independently of the main-window "Always on top" preference.
      alwaysOnTop: true,
      webPreferences: {
        preload: TOOLTIP_WINDOW_PRELOAD_WEBPACK_ENTRY,
      },
    });

    this.loadURL(TOOLTIP_WINDOW_WEBPACK_ENTRY);
    this.setAlwaysOnTop(true, "screen-saver");
  }

  public hideTooltip(): void {
    this.layoutGeneration++;
    if (!this.isDestroyed()) {
      this.hide();
    }
  }

  public showNearCursor(cursorX: number, cursorY: number): void {
    this.lastCursorX = cursorX;
    this.lastCursorY = cursorY;
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

    // Do not tie overlay visibility to the main application's top-most mode.
    // Reassert the z-order before every show because games can change their
    // own window z-order while switching menus/fullscreen states.
    this.setAlwaysOnTop(true, "screen-saver");
    this.showInactive();
    this.moveTop();

    // React receives the item just before this call. Give it a moment to paint,
    // then shrink the transparent window to the actual white price card and
    // flip the card around the latest cursor position if an edge would
    // otherwise be crossed.
    setTimeout(() => {
      void this.fitRenderedTooltipToScreen(generation);
    }, 40);
  }

  // This is called by a small main-process cursor-follow loop while a Tarkov
  // item tooltip is being tracked. Only move the existing native window; do
  // not re-measure React, rebuild the card or touch z-order on every frame.
  public moveNearCursor(cursorX: number, cursorY: number): void {
    if (this.isDestroyed()) {
      return;
    }

    this.lastCursorX = cursorX;
    this.lastCursorY = cursorY;

    const currentBounds = this.getBounds();
    const { x, y } = this.getPositionNearCursor(
      cursorX,
      cursorY,
      currentBounds.width,
      currentBounds.height
    );

    if (currentBounds.x !== x || currentBounds.y !== y) {
      this.setPosition(x, y, false);
    }

    // Normally the window is already visible and top-most. Only reassert those
    // properties if something external hid it, rather than doing expensive
    // z-order work at 60 FPS.
    if (!this.isVisible()) {
      this.setAlwaysOnTop(true, "screen-saver");
      this.showInactive();
      this.moveTop();
    }
  }

  private getPositionNearCursor(
    cursorX: number,
    cursorY: number,
    tooltipWidth: number,
    tooltipHeight: number
  ): { x: number; y: number } {
    const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY });
    const bounds = display.bounds;
    const rightEdge = bounds.x + bounds.width;
    const bottomEdge = bounds.y + bounds.height;

    const safeWidth = Math.max(1, Math.min(tooltipWidth, bounds.width));
    const safeHeight = Math.max(1, Math.min(tooltipHeight, bounds.height));

    let x = cursorX + this.cursorGap;
    let y = cursorY + this.cursorGap;

    if (x + safeWidth > rightEdge) {
      x = cursorX - this.cursorGap - safeWidth;
    }
    if (y + safeHeight > bottomEdge) {
      y = cursorY - this.cursorGap - safeHeight;
    }

    x = Math.max(bounds.x, Math.min(x, rightEdge - safeWidth));
    y = Math.max(bounds.y, Math.min(y, bottomEdge - safeHeight));

    return { x, y };
  }

  private async fitRenderedTooltipToScreen(
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

      const cursorX = this.lastCursorX;
      const cursorY = this.lastCursorY;
      const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY });
      const bounds = display.bounds;
      const tooltipWidth = Math.max(
        1,
        Math.min(Math.ceil(measured.width) + 2, bounds.width)
      );
      const tooltipHeight = Math.max(
        1,
        Math.min(Math.ceil(measured.height) + 2, bounds.height)
      );
      const { x, y } = this.getPositionNearCursor(
        cursorX,
        cursorY,
        tooltipWidth,
        tooltipHeight
      );

      if (generation !== this.layoutGeneration || this.isDestroyed()) {
        return;
      }

      this.setBounds({
        x,
        y,
        width: tooltipWidth,
        height: tooltipHeight,
      });
      this.moveTop();
    } catch (error) {
      // The already-visible, clamped 500x500 fallback remains on screen.
      console.error("Failed to fit tooltip to screen:", error);
    }
  }
}
