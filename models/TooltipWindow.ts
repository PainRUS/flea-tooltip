import { BrowserWindow, screen } from "electron";
import IpcConstants from "./IpcConstants";

declare const TOOLTIP_WINDOW_WEBPACK_ENTRY: string;
declare const TOOLTIP_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

type DisplayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export default class TooltipWindow extends BrowserWindow {
  private layoutGeneration = 0;
  private readonly cursorGap = 13;
  private lastCursorX = 0;
  private lastCursorY = 0;
  private renderedTooltipWidth = 500;
  private renderedTooltipHeight = 500;
  private activeDisplayId: number | null = null;
  private activeDisplayBounds: DisplayBounds | null = null;

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
      focusable: false,
      hasShadow: false,
      // The price popup is an in-game overlay and must stay above Tarkov
      // independently of the main-window "Always on top" preference.
      alwaysOnTop: true,
      webPreferences: {
        preload: TOOLTIP_WINDOW_PRELOAD_WEBPACK_ENTRY,
      },
    });

    this.loadURL(TOOLTIP_WINDOW_WEBPACK_ENTRY);
    this.setAlwaysOnTop(true, "screen-saver");

    // The stationary transparent canvas can cover an entire monitor. It must
    // never participate in hit-testing or change the game cursor underneath.
    this.setIgnoreMouseEvents(true);
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
    const bounds = this.ensureCanvasForCursor(cursorX, cursorY);

    // The native BrowserWindow is now a stationary transparent canvas covering
    // the current monitor. Only the small DOM price card moves inside it.
    this.sendCardPosition(
      cursorX,
      cursorY,
      this.renderedTooltipWidth,
      this.renderedTooltipHeight,
      bounds
    );

    // Do not tie overlay visibility to the main application's top-most mode.
    // Reassert the z-order only when showing the overlay, never every frame.
    this.setAlwaysOnTop(true, "screen-saver");
    this.showInactive();
    this.moveTop();

    // React receives the item just before this call. Give it a moment to paint,
    // then measure the actual white price card so edge flipping uses its real
    // dimensions. The BrowserWindow itself remains monitor-sized and stationary.
    setTimeout(() => {
      void this.fitRenderedTooltipToScreen(generation);
    }, 40);
  }

  // Called by the lightweight main-process cursor-follow loop. While the cursor
  // remains on one monitor this sends only two small coordinates to the renderer;
  // it does not move/resize the native BrowserWindow at 60 FPS.
  public moveNearCursor(cursorX: number, cursorY: number): void {
    if (this.isDestroyed()) {
      return;
    }

    this.lastCursorX = cursorX;
    this.lastCursorY = cursorY;
    const bounds = this.ensureCanvasForCursor(cursorX, cursorY);

    this.sendCardPosition(
      cursorX,
      cursorY,
      this.renderedTooltipWidth,
      this.renderedTooltipHeight,
      bounds
    );

    // Normally the window is already visible and top-most. Only recover those
    // properties if something external hid it.
    if (!this.isVisible()) {
      this.setAlwaysOnTop(true, "screen-saver");
      this.showInactive();
      this.moveTop();
    }
  }

  private ensureCanvasForCursor(
    cursorX: number,
    cursorY: number
  ): DisplayBounds {
    const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY });
    const bounds = display.bounds;

    if (
      this.activeDisplayId !== display.id ||
      !this.activeDisplayBounds ||
      this.activeDisplayBounds.x !== bounds.x ||
      this.activeDisplayBounds.y !== bounds.y ||
      this.activeDisplayBounds.width !== bounds.width ||
      this.activeDisplayBounds.height !== bounds.height
    ) {
      // This is the only normal cursor-follow case that changes the native
      // window geometry: initial placement or crossing onto another monitor.
      this.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
      this.activeDisplayId = display.id;
      this.activeDisplayBounds = { ...bounds };
    }

    return bounds;
  }

  private sendCardPosition(
    cursorX: number,
    cursorY: number,
    tooltipWidth: number,
    tooltipHeight: number,
    bounds: DisplayBounds
  ): void {
    if (this.webContents.isDestroyed()) {
      return;
    }

    const { x, y } = this.getPositionNearCursor(
      cursorX,
      cursorY,
      tooltipWidth,
      tooltipHeight,
      bounds
    );

    this.webContents.send(IpcConstants.TooltipPositionChanged, {
      // CSS coordinates are local to the monitor-sized transparent canvas.
      x: x - bounds.x,
      y: y - bounds.y,
    });
  }

  private getPositionNearCursor(
    cursorX: number,
    cursorY: number,
    tooltipWidth: number,
    tooltipHeight: number,
    bounds: DisplayBounds
  ): { x: number; y: number } {
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
          const layer = document.getElementById("tooltip-card-layer");
          const card = layer?.firstElementChild;
          if (!card) return null;

          const rect = card.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return null;

          return {
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height),
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
      const bounds = this.ensureCanvasForCursor(cursorX, cursorY);

      this.renderedTooltipWidth = Math.max(
        1,
        Math.min(Math.ceil(measured.width) + 2, bounds.width)
      );
      this.renderedTooltipHeight = Math.max(
        1,
        Math.min(Math.ceil(measured.height) + 2, bounds.height)
      );

      if (generation !== this.layoutGeneration || this.isDestroyed()) {
        return;
      }

      this.sendCardPosition(
        cursorX,
        cursorY,
        this.renderedTooltipWidth,
        this.renderedTooltipHeight,
        bounds
      );
    } catch (error) {
      console.error("Failed to fit tooltip to screen:", error);
    }
  }
}
