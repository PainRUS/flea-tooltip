import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PRICE_COLORS,
  DEFAULT_PRICE_COLOR_THRESHOLDS,
  normalizePriceColors,
  normalizePriceColorThresholds,
  numberWithCommas,
} from "../../utils";
import { AppLanguage } from "../../models/UserConfig";

function cloneDefaults(): { thresholds: number[]; colors: string[] } {
  return {
    thresholds: [...DEFAULT_PRICE_COLOR_THRESHOLDS],
    colors: [...DEFAULT_PRICE_COLORS],
  };
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export default function PriceColorSettings() {
  const defaults = cloneDefaults();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [enabled, setEnabled] = useState(true);
  const [thresholds, setThresholds] = useState<number[]>(defaults.thresholds);
  const [colors, setColors] = useState<string[]>(defaults.colors);
  const [message, setMessage] = useState("");

  const ru = language === "ru";
  const t = (en: string, russian: string) => (ru ? russian : en);

  const loadConfig = async () => {
    try {
      const config = await window.electron.getUserConfig();
      setLanguage(config.language ?? "en");
      setEnabled(config.priceColorsEnabled ?? true);
      setThresholds(
        normalizePriceColorThresholds(config.priceColorThresholds)
      );
      setColors(normalizePriceColors(config.priceColors));
    } catch (error) {
      console.error("Failed to load price color settings:", error);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  useEffect(() => {
    if (open) {
      setMessage("");
      void loadConfig();
    }
  }, [open]);

  const normalizedPreviewThresholds = useMemo(
    () => normalizePriceColorThresholds(thresholds),
    [thresholds]
  );

  const formatPrice = (value: number) =>
    numberWithCommas(Math.round(value))?.replace(/,/g, " ") ?? "0";

  const describeBand = (index: number): string => {
    const values = normalizedPreviewThresholds;
    if (index === 0) {
      return t(
        `below ₽${formatPrice(values[0])}`,
        `до ₽${formatPrice(values[0])}`
      );
    }
    if (index === colors.length - 1) {
      return t(
        `from ₽${formatPrice(values[values.length - 1])}`,
        `от ₽${formatPrice(values[values.length - 1])}`
      );
    }

    return `₽${formatPrice(values[index - 1])}–${formatPrice(values[index])}`;
  };

  const handleThresholdChange = (index: number, value: number) => {
    const next = [...thresholds];
    next[index] = Math.max(0, Number.isFinite(value) ? Math.round(value) : 0);
    setThresholds(next);
    setMessage("");
  };

  const handleColorChange = (index: number, value: string) => {
    const next = [...colors];
    next[index] = value;
    setColors(next);
    setMessage("");
  };

  const save = async () => {
    try {
      const nextThresholds = normalizePriceColorThresholds(thresholds);
      const nextColors = normalizePriceColors(colors);
      const config = await window.electron.getUserConfig();
      config.priceColorsEnabled = enabled;
      config.priceColorThresholds = nextThresholds;
      config.priceColors = nextColors;
      await window.electron.setUserConfig(config);
      setThresholds(nextThresholds);
      setColors(nextColors);
      setMessage(t("Saved", "Сохранено"));
    } catch (error) {
      console.error("Failed to save price color settings:", error);
      setMessage(t("Failed to save", "Не удалось сохранить"));
    }
  };

  const reset = () => {
    const next = cloneDefaults();
    setEnabled(true);
    setThresholds(next.thresholds);
    setColors(next.colors);
    setMessage(
      t(
        "Defaults loaded — press Save",
        "Загружены значения по умолчанию — нажмите Сохранить"
      )
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 px-2 py-1 text-[11px] font-bold bg-stone-700 hover:bg-stone-600 border-b border-l border-stone-600 whitespace-nowrap"
        title={t("Configure price colors", "Настроить цвета цен")}
      >
        {t("Price colors", "Цвета цен")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/90 p-4">
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-lg bg-stone-800 p-4 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">
                  {t("Price colors", "Цвета цен")}
                </h2>
                <p className="text-xs text-stone-400">
                  {t(
                    "Colors are selected by displayed RUB value per slot. Flea and trader prices are colored independently.",
                    "Цвет выбирается по отображаемой цене в рублях за слот. Цена барахолки и трейдера окрашиваются отдельно."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-2xl leading-none text-stone-300 hover:text-white"
                aria-label={t("Close", "Закрыть")}
              >
                ×
              </button>
            </div>

            <label className="mb-4 flex items-center justify-between gap-4 rounded bg-stone-700/60 px-3 py-2">
              <div>
                <div className="text-sm font-semibold">
                  {t("Enable price colors", "Включить цветные цены")}
                </div>
                <div className="text-xs text-stone-400">
                  {t(
                    "Disable to return to the normal tooltip text color.",
                    "Отключите, чтобы вернуть обычный цвет текста подсказки."
                  )}
                </div>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 accent-green-500"
              />
            </label>

            <div className="space-y-2">
              <div className="text-xs text-stone-400">
                {t(
                  "Thresholds define five price bands:",
                  "Пороги делят цены на пять диапазонов:"
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {thresholds.map((threshold, index) => (
                  <label key={index} className="text-xs text-stone-300">
                    {t(`Threshold ${index + 1}`, `Порог ${index + 1}`)}
                    <div className="mt-1 flex items-center rounded border border-stone-600 bg-stone-700 px-2">
                      <span className="mr-1 text-stone-400">₽</span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={threshold}
                        onChange={(event) =>
                          handleThresholdChange(index, Number(event.target.value))
                        }
                        className="w-full bg-transparent py-1.5 text-white outline-none"
                      />
                    </div>
                  </label>
                ))}
              </div>

              <div className="pt-2 space-y-2">
                {colors.map((color, index) => {
                  const safeColor = isHexColor(color)
                    ? color
                    : DEFAULT_PRICE_COLORS[index];
                  return (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_42px_100px] items-center gap-2 rounded bg-stone-700/50 px-2 py-2"
                    >
                      <div className="min-w-0">
                        <div
                          className="text-sm font-semibold"
                          style={{ color: safeColor }}
                        >
                          {describeBand(index)}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          {t(`Band ${index + 1}`, `Диапазон ${index + 1}`)}
                        </div>
                      </div>
                      <input
                        type="color"
                        value={safeColor}
                        onChange={(event) =>
                          handleColorChange(index, event.target.value)
                        }
                        className="h-8 w-10 cursor-pointer rounded border border-stone-600 bg-transparent p-0"
                        aria-label={t(
                          `Color for band ${index + 1}`,
                          `Цвет диапазона ${index + 1}`
                        )}
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(event) =>
                          handleColorChange(index, event.target.value)
                        }
                        className={`w-full rounded border bg-stone-700 px-2 py-1 text-xs outline-none ${
                          isHexColor(color)
                            ? "border-stone-600"
                            : "border-red-500"
                        }`}
                        maxLength={7}
                        spellCheck={false}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {message && (
              <div className="mt-3 text-center text-xs text-amber-300">
                {message}
              </div>
            )}

            <div className="mt-4 flex justify-between gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded bg-stone-700 px-3 py-2 text-sm hover:bg-stone-600"
              >
                {t("Defaults", "По умолчанию")}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded bg-stone-700 px-3 py-2 text-sm hover:bg-stone-600"
                >
                  {t("Cancel", "Отмена")}
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="rounded bg-green-600 px-3 py-2 text-sm font-bold hover:bg-green-500"
                >
                  {t("Save", "Сохранить")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}