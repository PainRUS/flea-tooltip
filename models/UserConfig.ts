export type AppLanguage = "en" | "ru";

export type UserConfig = {
  mainWindow: {
    width: number;
    height: number;
    x: number | null;
    y: number | null;
  };
  soundEnabled?: boolean;
  soundVolume?: number; // 0.0 to 1.0
  enableTooltips?: boolean;
  isFrameless?: boolean;
  enableAlwaysOnTop?: boolean;
  tarkovMarketApiKey?: string;
  lowestAcceptableScore?: number;
  borderColorRed?: number; // 0-255
  borderColorGreen?: number; // 0-255
  borderColorBlue?: number; // 0-255
  enableMainWindowToggle?: boolean;
  enableDeleteLowestItem?: boolean;
  enableDeleteLastItem?: boolean;
  enableIncrementLastItem?: boolean;
  enableScreenCalibration?: boolean;
  usePveMode?: boolean;
  showTotalPrice?: boolean;
  language?: AppLanguage;
  ocrDebugMode?: boolean;
  ocrDebugStepDelay?: number; // 100-2000 ms
  lastPriceUpdateAt?: number | null;
  nextPriceUpdateAt?: number | null;
  priceUpdateFailed?: boolean;
  priceColorsEnabled?: boolean;
  // Four ascending RUB-per-slot boundaries split prices into five color bands.
  priceColorThresholds?: number[];
  // Five #RRGGBB colors, from the cheapest band to the most expensive.
  priceColors?: string[];
};