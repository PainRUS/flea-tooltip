import { screen, app, BrowserWindow } from "electron";
import { spawn } from "child_process";
import TooltipWindow from "./TooltipWindow";
import Items from "./Items";
import IpcConstants from "./IpcConstants";
import path from "path";
import fs from "fs";
import { isDev } from "../utils";
import koffi from "koffi";
import log from "electron-log";
import Item from "./Item";
import { getUserConfigData } from "../main/services/config";
import { AppLanguage } from "./UserConfig";

export default class OCRProcess {
  constructor(items: Items, priceListWindow: BrowserWindow) {
    this.priceListWindow = priceListWindow;
    this.items = items;
    this.itemNamesLowerCaseList = this.items.items.map((item) =>
      item.searchName.toLowerCase()
    );
  }

  public tooltipWindow: TooltipWindow | null;
  protected priceListWindow: BrowserWindow;
  protected items: Items;
  protected itemNamesLowerCaseList: string[] = [];
  protected user32: koffi.IKoffiLib;
  protected Point: koffi.IKoffiCType;
  protected language: AppLanguage = "en";
  protected stdoutBuffer = "";

  public setPriceListWindow(priceListWindow: BrowserWindow): void {
    this.priceListWindow = priceListWindow;
  }

  getMousePos(): { x: number; y: number } | null {
    const GetCursorPos = this.user32.func(
      "int __stdcall GetCursorPos(_Out_ POINT *pos)"
    );

    const pos = {};
    try {
      if (!GetCursorPos(pos)) throw new Error("Failed to get cursor position");
      return pos as { x: number; y: number };
    } catch (error) {
      console.error("Error getting cursor position:", error);
      return null;
    }
  }

  // Convert physical pixel coordinates to logical (DPI-scaled) coordinates for Electron
  getLogicalPosition(
    physicalX: number,
    physicalY: number
  ): { x: number; y: number } {
    const display = screen.getDisplayNearestPoint({
      x: physicalX,
      y: physicalY,
    });
    const scaleFactor = display.scaleFactor;

    return {
      x: Math.round(physicalX / scaleFactor),
      y: Math.round(physicalY / scaleFactor),
    };
  }

  initialize(): void {
    this.user32 = koffi.load("user32.dll");
    this.Point = koffi.struct("POINT", {
      x: "long",
      y: "long",
    });

    const userConfig = getUserConfigData();
    const redValue = userConfig.borderColorRed ?? 82;
    const greenValue = userConfig.borderColorGreen ?? 89;
    const blueValue = userConfig.borderColorBlue ?? 90;
    this.language = userConfig.language ?? "en";

    const debugMode = userConfig.ocrDebugMode ?? false;
    const debugStepDelay = Math.max(
      100,
      Math.min(2000, userConfig.ocrDebugStepDelay ?? 800)
    );

    const tesseractLanguage = this.language === "ru" ? "rus" : "eng";
    const ocrDir = isDev()
      ? path.join(app.getAppPath(), "lib", "ocr")
      : path.join(process.resourcesPath, "ocr");
    const ocrExecutable = path.join(ocrDir, "ocr_cpp.exe");
    const trainedDataPath = path.join(
      ocrDir,
      `${tesseractLanguage}.traineddata`
    );

    if (!fs.existsSync(trainedDataPath)) {
      const message = `Missing OCR language data: ${trainedDataPath}`;
      isDev() ? console.error(message) : log.error(message);
      return;
    }

    isDev()
      ? console.log(
          "Initializing OCR process with values:",
          redValue,
          greenValue,
          blueValue,
          "language:",
          tesseractLanguage,
          "debug:",
          debugMode,
          "debug delay:",
          debugStepDelay
        )
      : log.info(
          `Initializing OCR process (${tesseractLanguage}, debug=${debugMode}, delay=${debugStepDelay}ms)`
        );

    const ocrProcess = spawn(
      ocrExecutable,
      [
        redValue.toString(),
        greenValue.toString(),
        blueValue.toString(),
        tesseractLanguage,
        debugMode ? "1" : "0",
        debugStepDelay.toString(),
      ],
      {
        cwd: ocrDir,
        env: {
          ...process.env,
          TESSDATA_PREFIX: ocrDir,
        },
      }
    );

    ocrProcess.stdout.setEncoding("utf-8");
    ocrProcess.stdout.on("data", this.onStdoutChunk.bind(this));
    ocrProcess.stderr.on("data", function (data) {
      isDev() ? console.log("stderr: " + data) : log.error("stderr: " + data);
    });

    ocrProcess.on("close", function (code) {
      isDev()
        ? console.log("closing code: " + code)
        : log.info("closing code: " + code);
    });

    isDev()
      ? console.log("Successfully initialized OCR process")
      : log.info("Successfully initialized OCR process");
  }

  // stdout is a byte stream: one chunk can contain several scanner messages or
  // half of one UTF-8 message. Buffer it and process complete lines only.
  onStdoutChunk(data: any): void {
    this.stdoutBuffer += data.toString();
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      this.onNewData(line);
    }
  }

  onNewData(data: any): void {
    try {
      const incomingData = String(data).trim();
      if (!incomingData) {
        return;
      }

      if (incomingData.startsWith("DEBUG|")) {
        // Visual debug is rendered by the native OCR process. Keep a textual
        // trace in the development console as well without feeding it into
        // item matching.
        if (isDev()) {
          console.log(incomingData);
        }
        return;
      }

      if (incomingData.includes("IGNORE||NO CONFIG FILE FOUND")) {
        this.priceListWindow.webContents.send(
          IpcConstants.ScreenConfigureNeeded
        );
        return;
      }

      if (incomingData === "MOUSEMOVE") {
        if (this.tooltipWindow) {
          this.tooltipWindow.webContents.send(
            IpcConstants.NewTooltipItem,
            null
          );
          setTimeout(() => {
            this.tooltipWindow?.hideTooltip();
          }, 30);
        }
      } else if (incomingData.includes("||")) {
        // English OCR historically strips non-ASCII noise. Russian OCR must
        // preserve UTF-8 Cyrillic output.
        const incomingDataCleanedUp =
          this.language === "ru"
            ? incomingData
            : incomingData.replace(/[^\x00-\x7F]/g, "");
        let itemName = incomingDataCleanedUp.split("||")[0];
        const coords = incomingDataCleanedUp.split("||")[1];
        if (!coords || !coords.includes(",")) {
          return;
        }

        const x = parseInt(coords.split(",")[0]);
        const y = parseInt(coords.split(",")[1]);
        let item: Item | null = null;

        if (
          !itemName.toLowerCase().includes("thicc") &&
          !itemName.toLowerCase().includes("junk") &&
          !itemName.toLowerCase().includes("items case")
        ) {
          if (this.itemNamesLowerCaseList.includes(itemName.toLowerCase())) {
            item = this.items.items.find(
              (candidate) =>
                candidate.searchName.toLowerCase() === itemName.toLowerCase()
            );
          } else {
            // These OCR corrections are English-specific and are intentionally
            // disabled when Russian scanning is selected.
            if (this.language === "en") {
              if (itemName.includes("WD-40 (1")) {
                itemName = "WD-40 (100ml)";
              } else if (itemName.includes("WD-40 (4")) {
                itemName = "WD-40 (400ml)";
              }

              if (itemName.toLowerCase().includes("kektape")) {
                itemName = "kektape";
              }

              if (itemName.toLowerCase().includes("pc cpi")) {
                itemName = "pc cpu";
              }

              if (itemName.toLowerCase().includes("mule")) {
                itemName = "M.U.L.E stimulant injector";
              }
            }

            const allowedLowerScoreItems = [
              "magnet",
              "arena",
              "cult",
              "poste",
              "kektape",
              "military",
              "matche",
              "sewing",
              "key tool",
            ];

            if (this.items && this.items.search) {
              const userConfig = getUserConfigData();
              item = this.items.search(
                itemName,
                this.language === "en" &&
                  allowedLowerScoreItems.some((value) =>
                    itemName.toLowerCase().includes(value)
                  )
                  ? 12
                  : userConfig.lowestAcceptableScore ?? 50
              );
            }
          }
        }

        if (item && item.name !== "T H I C C item case") {
          const mousePos = this.getMousePos();
          if (!mousePos) {
            return;
          }

          if (
            mousePos.x < 2560 / 2 + 10 &&
            mousePos.y < 1440 / 2 + 10 &&
            mousePos.x > 2560 / 2 - 10 &&
            mousePos.y > 1440 / 2 - 10
          ) {
            return;
          }

          if (mousePos.x === x && mousePos.y === y) {
            if (
              !incomingData.includes("||MENU") &&
              this.priceListWindow.isVisible()
            ) {
              this.priceListWindow.webContents.send(
                IpcConstants.NewTooltipItem,
                item
              );
            }

            if (this.tooltipWindow) {
              this.tooltipWindow.webContents.send(
                IpcConstants.NewTooltipItem,
                item
              );
              setTimeout(() => {
                const logicalPos = this.getLogicalPosition(
                  mousePos.x,
                  mousePos.y
                );
                this.tooltipWindow?.showNearCursor(
                  logicalPos.x,
                  logicalPos.y
                );
              }, 5);
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  }
}
