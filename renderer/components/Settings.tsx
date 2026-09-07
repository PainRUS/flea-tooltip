import React, { useEffect, useState } from "react";
import { AppLanguage, UserConfig } from "../../models/UserConfig";

interface SettingsProps {
  onClose: () => void;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  soundVolume: number;
  onSoundVolumeChange: (volume: number) => void;
  enableTooltips: boolean;
  onEnableTooltipsChange: (enabled: boolean) => void;
  isFrameless: boolean;
  onIsFramelessChange: (enabled: boolean) => void;
  enableAlwaysOnTop: boolean;
  onEnableAlwaysOnTopChange: (enabled: boolean) => void;
  tarkovMarketApiKey: string;
  onTarkovMarketApiKeyChange: (apiKey: string) => void;
  lowestAcceptableScore: number;
  onLowestAcceptableScoreChange: (score: number) => void;
  borderColorRed: number;
  onBorderColorRedChange: (red: number) => void;
  borderColorGreen: number;
  onBorderColorGreenChange: (green: number) => void;
  borderColorBlue: number;
  onBorderColorBlueChange: (blue: number) => void;
  enableMainWindowToggle: boolean;
  onEnableMainWindowToggleChange: (enabled: boolean) => void;
  enableDeleteLowestItem: boolean;
  onEnableDeleteLowestItemChange: (enabled: boolean) => void;
  enableDeleteLastItem: boolean;
  onEnableDeleteLastItemChange: (enabled: boolean) => void;
  enableIncrementLastItem: boolean;
  onEnableIncrementLastItemChange: (enabled: boolean) => void;
  enableScreenCalibration: boolean;
  onEnableScreenCalibrationChange: (enabled: boolean) => void;
  usePveMode: boolean;
  onUsePveModeChange: (enabled: boolean) => void;
  showTotalPrice: boolean;
  onShowTotalPriceChange: (enabled: boolean) => void;
}

function Toggle({
  id,
  enabled,
  onToggle,
}: {
  id: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      id={id}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-10 min-w-10 items-center rounded-full transition-colors ${
        enabled ? "bg-green-500" : "bg-stone-600"
      }`}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-[22px]" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function Settings({
  onClose,
  soundEnabled,
  onSoundEnabledChange,
  soundVolume,
  onSoundVolumeChange,
  enableTooltips,
  onEnableTooltipsChange,
  isFrameless,
  onIsFramelessChange,
  enableAlwaysOnTop,
  onEnableAlwaysOnTopChange,
  tarkovMarketApiKey,
  onTarkovMarketApiKeyChange,
  lowestAcceptableScore,
  onLowestAcceptableScoreChange,
  borderColorRed,
  onBorderColorRedChange,
  borderColorGreen,
  onBorderColorGreenChange,
  borderColorBlue,
  onBorderColorBlueChange,
  enableMainWindowToggle,
  onEnableMainWindowToggleChange,
  enableDeleteLowestItem,
  onEnableDeleteLowestItemChange,
  enableDeleteLastItem,
  onEnableDeleteLastItemChange,
  enableIncrementLastItem,
  onEnableIncrementLastItemChange,
  enableScreenCalibration,
  onEnableScreenCalibrationChange,
  usePveMode,
  onUsePveModeChange,
  showTotalPrice,
  onShowTotalPriceChange,
}: SettingsProps) {
  const [localSoundEnabled, setLocalSoundEnabled] = useState(soundEnabled);
  const [localSoundVolume, setLocalSoundVolume] = useState(soundVolume);
  const [localEnableTooltips, setLocalEnableTooltips] = useState(enableTooltips);
  const [localIsFrameless, setLocalIsFrameless] = useState(isFrameless);
  const [localEnableAlwaysOnTop, setLocalEnableAlwaysOnTop] =
    useState(enableAlwaysOnTop);
  const [localTarkovMarketApiKey, setLocalTarkovMarketApiKey] =
    useState(tarkovMarketApiKey);
  const [localLowestAcceptableScore, setLocalLowestAcceptableScore] =
    useState(lowestAcceptableScore);
  const [localBorderColorRed, setLocalBorderColorRed] = useState(borderColorRed);
  const [localBorderColorGreen, setLocalBorderColorGreen] =
    useState(borderColorGreen);
  const [localBorderColorBlue, setLocalBorderColorBlue] =
    useState(borderColorBlue);
  const [localEnableMainWindowToggle, setLocalEnableMainWindowToggle] =
    useState(enableMainWindowToggle);
  const [localEnableDeleteLowestItem, setLocalEnableDeleteLowestItem] =
    useState(enableDeleteLowestItem);
  const [localEnableDeleteLastItem, setLocalEnableDeleteLastItem] =
    useState(enableDeleteLastItem);
  const [localEnableIncrementLastItem, setLocalEnableIncrementLastItem] =
    useState(enableIncrementLastItem);
  const [localEnableScreenCalibration, setLocalEnableScreenCalibration] =
    useState(enableScreenCalibration);
  const [localUsePveMode, setLocalUsePveMode] = useState(usePveMode);
  const [localShowTotalPrice, setLocalShowTotalPrice] = useState(showTotalPrice);
  const [localLanguage, setLocalLanguage] = useState<AppLanguage>("en");
  const [localOcrDebugMode, setLocalOcrDebugMode] = useState(false);
  const [localOcrDebugStepDelay, setLocalOcrDebugStepDelay] = useState(800);
  const [isValidatingApiKey, setIsValidatingApiKey] = useState(false);
  const [apiKeyValidationMessage, setApiKeyValidationMessage] = useState("");
  const [languageMessage, setLanguageMessage] = useState("");
  const [debugMessage, setDebugMessage] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const ru = localLanguage === "ru";
  const t = (en: string, russian: string) => (ru ? russian : en);

  useEffect(() => {
    const loadExtendedSettings = async () => {
      try {
        const config = await window.electron.getUserConfig();
        setLocalLanguage(config.language ?? "en");
        setLocalOcrDebugMode(config.ocrDebugMode ?? false);
        setLocalOcrDebugStepDelay(config.ocrDebugStepDelay ?? 800);
      } catch (error) {
        console.error("Failed to load extended settings:", error);
      }
    };
    loadExtendedSettings();
  }, []);

  useEffect(() => setLocalSoundEnabled(soundEnabled), [soundEnabled]);
  useEffect(() => setLocalSoundVolume(soundVolume), [soundVolume]);
  useEffect(() => setLocalEnableTooltips(enableTooltips), [enableTooltips]);
  useEffect(() => setLocalIsFrameless(isFrameless), [isFrameless]);
  useEffect(
    () => setLocalEnableAlwaysOnTop(enableAlwaysOnTop),
    [enableAlwaysOnTop]
  );
  useEffect(
    () => setLocalTarkovMarketApiKey(tarkovMarketApiKey),
    [tarkovMarketApiKey]
  );
  useEffect(
    () => setLocalLowestAcceptableScore(lowestAcceptableScore),
    [lowestAcceptableScore]
  );
  useEffect(() => setLocalBorderColorRed(borderColorRed), [borderColorRed]);
  useEffect(
    () => setLocalBorderColorGreen(borderColorGreen),
    [borderColorGreen]
  );
  useEffect(() => setLocalBorderColorBlue(borderColorBlue), [borderColorBlue]);
  useEffect(
    () => setLocalEnableMainWindowToggle(enableMainWindowToggle),
    [enableMainWindowToggle]
  );
  useEffect(
    () => setLocalEnableDeleteLowestItem(enableDeleteLowestItem),
    [enableDeleteLowestItem]
  );
  useEffect(
    () => setLocalEnableDeleteLastItem(enableDeleteLastItem),
    [enableDeleteLastItem]
  );
  useEffect(
    () => setLocalEnableIncrementLastItem(enableIncrementLastItem),
    [enableIncrementLastItem]
  );
  useEffect(
    () => setLocalEnableScreenCalibration(enableScreenCalibration),
    [enableScreenCalibration]
  );
  useEffect(() => setLocalUsePveMode(usePveMode), [usePveMode]);
  useEffect(() => setLocalShowTotalPrice(showTotalPrice), [showTotalPrice]);

  const updateConfig = async (mutate: (config: UserConfig) => void) => {
    const config = await window.electron.getUserConfig();
    mutate(config);
    await window.electron.setUserConfig(config);
  };

  const handleLanguageChange = async (language: AppLanguage) => {
    setLocalLanguage(language);
    try {
      await updateConfig((config) => {
        config.language = language;
      });
      setLanguageMessage(
        language === "ru"
          ? "Язык сохранён. Перезапустите приложение, чтобы переключить OCR, базу предметов и весь интерфейс."
          : "Language saved. Restart the application to switch OCR, item data and the full UI."
      );
    } catch (error) {
      console.error("Failed to save language setting:", error);
      setLanguageMessage(
        language === "ru"
          ? "Не удалось сохранить язык."
          : "Failed to save language."
      );
    }
  };

  const handleOcrDebugToggle = async (enabled: boolean) => {
    setLocalOcrDebugMode(enabled);
    try {
      await updateConfig((config) => {
        config.ocrDebugMode = enabled;
      });
      setDebugMessage(
        t(
          "Debug setting saved. Restart the application to apply it.",
          "Настройка отладки сохранена. Перезапустите приложение, чтобы применить её."
        )
      );
    } catch (error) {
      console.error("Failed to save OCR debug setting:", error);
    }
  };

  const handleOcrDebugDelayChange = async (delay: number) => {
    const clamped = Math.max(100, Math.min(2000, delay));
    setLocalOcrDebugStepDelay(clamped);
    try {
      await updateConfig((config) => {
        config.ocrDebugStepDelay = clamped;
      });
      setDebugMessage(
        t(
          "Debug delay saved. Restart the application to apply it.",
          "Задержка отладки сохранена. Перезапустите приложение, чтобы применить её."
        )
      );
    } catch (error) {
      console.error("Failed to save OCR debug delay:", error);
    }
  };

  const handleSoundToggle = async (enabled: boolean) => {
    setLocalSoundEnabled(enabled);
    onSoundEnabledChange(enabled);
    try {
      await updateConfig((config) => {
        config.soundEnabled = enabled;
      });
    } catch (error) {
      console.error("Failed to save user config:", error);
    }
  };

  const handleVolumeChange = async (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setLocalSoundVolume(clampedVolume);
    onSoundVolumeChange(clampedVolume);
    try {
      await updateConfig((config) => {
        config.soundVolume = clampedVolume;
      });
    } catch (error) {
      console.error("Failed to save user config:", error);
    }
  };

  const handleTooltipsToggle = async (enabled: boolean) => {
    setLocalEnableTooltips(enabled);
    onEnableTooltipsChange(enabled);
    try {
      await updateConfig((config) => {
        config.enableTooltips = enabled;
      });
      await window.electron.toggleTooltips(enabled);
    } catch (error) {
      console.error("Failed to save user config or toggle tooltips:", error);
    }
  };

  const handleFramelessToggle = async (enabled: boolean) => {
    setLocalIsFrameless(enabled);
    onIsFramelessChange(enabled);
    try {
      await updateConfig((config) => {
        config.isFrameless = enabled;
      });
      await window.electron.toggleFrameless(enabled);
    } catch (error) {
      console.error("Failed to save user config or toggle frameless mode:", error);
    }
  };

  const handleAlwaysOnTopToggle = async (enabled: boolean) => {
    setLocalEnableAlwaysOnTop(enabled);
    onEnableAlwaysOnTopChange(enabled);
    try {
      await updateConfig((config) => {
        config.enableAlwaysOnTop = enabled;
      });
      await window.electron.toggleAlwaysOnTop(enabled);
    } catch (error) {
      console.error("Failed to save user config or toggle always on top:", error);
    }
  };

  const handleApiKeyValidation = async () => {
    if (!localTarkovMarketApiKey.trim()) {
      setApiKeyValidationMessage(
        t("Please enter an API key", "Введите API-ключ")
      );
      return;
    }

    setIsValidatingApiKey(true);
    setApiKeyValidationMessage("");

    try {
      const isValid = await window.electron.validateApiKey(
        localTarkovMarketApiKey.trim()
      );
      if (isValid) {
        await updateConfig((config) => {
          config.tarkovMarketApiKey = localTarkovMarketApiKey.trim();
        });
        onTarkovMarketApiKeyChange(localTarkovMarketApiKey.trim());
        await window.electron.refetchItems();
        setApiKeyValidationMessage(
          t(
            "✓ API key validated and items updated!",
            "✓ API-ключ проверен, база предметов обновлена!"
          )
        );
      } else {
        setApiKeyValidationMessage(
          t("✗ Invalid API key", "✗ Неверный API-ключ")
        );
      }
    } catch (error) {
      console.error("API key validation failed:", error);
      setApiKeyValidationMessage(
        t(
          "✗ Validation failed - please try again",
          "✗ Ошибка проверки — попробуйте ещё раз"
        )
      );
    } finally {
      setIsValidatingApiKey(false);
    }
  };

  const handleApiKeyClear = async () => {
    setLocalTarkovMarketApiKey("");
    onTarkovMarketApiKeyChange("");
    try {
      await updateConfig((config) => {
        config.tarkovMarketApiKey = "";
      });
      await window.electron.refetchItems();
      setApiKeyValidationMessage(
        t(
          "✓ API key cleared - using Tarkov.dev",
          "✓ API-ключ удалён — используется Tarkov.dev"
        )
      );
    } catch (error) {
      console.error("Failed to clear API key:", error);
      setApiKeyValidationMessage(
        t("✗ Failed to clear API key", "✗ Не удалось удалить API-ключ")
      );
    }
  };

  const handleLowestAcceptableScoreChange = async (score: number) => {
    setLocalLowestAcceptableScore(score);
    onLowestAcceptableScoreChange(score);
    try {
      await updateConfig((config) => {
        config.lowestAcceptableScore = score;
      });
    } catch (error) {
      console.error("Failed to save user config:", error);
    }
  };

  const handleBorderColorChange = async (
    channel: "red" | "green" | "blue",
    value: number
  ) => {
    const clamped = Math.max(0, Math.min(255, value));
    if (channel === "red") {
      setLocalBorderColorRed(clamped);
      onBorderColorRedChange(clamped);
    } else if (channel === "green") {
      setLocalBorderColorGreen(clamped);
      onBorderColorGreenChange(clamped);
    } else {
      setLocalBorderColorBlue(clamped);
      onBorderColorBlueChange(clamped);
    }

    try {
      await updateConfig((config) => {
        if (channel === "red") config.borderColorRed = clamped;
        if (channel === "green") config.borderColorGreen = clamped;
        if (channel === "blue") config.borderColorBlue = clamped;
      });
    } catch (error) {
      console.error("Failed to save user config:", error);
    }
  };

  const handleMainWindowToggle = async (enabled: boolean) => {
    setLocalEnableMainWindowToggle(enabled);
    onEnableMainWindowToggleChange(enabled);
    await window.electron.toggleMainWindow(enabled);
  };

  const handleDeleteLowestItemToggle = async (enabled: boolean) => {
    setLocalEnableDeleteLowestItem(enabled);
    onEnableDeleteLowestItemChange(enabled);
    await window.electron.toggleDeleteLowestItem(enabled);
  };

  const handleDeleteLastItemToggle = async (enabled: boolean) => {
    setLocalEnableDeleteLastItem(enabled);
    onEnableDeleteLastItemChange(enabled);
    await window.electron.toggleDeleteLastItem(enabled);
  };

  const handleIncrementLastItemToggle = async (enabled: boolean) => {
    setLocalEnableIncrementLastItem(enabled);
    onEnableIncrementLastItemChange(enabled);
    await window.electron.toggleIncrementLastItem(enabled);
  };

  const handleScreenCalibrationToggle = async (enabled: boolean) => {
    setLocalEnableScreenCalibration(enabled);
    onEnableScreenCalibrationChange(enabled);
    await window.electron.toggleScreenCalibration(enabled);
  };

  const handleUsePveModeToggle = async (enabled: boolean) => {
    setLocalUsePveMode(enabled);
    onUsePveModeChange(enabled);
    try {
      await updateConfig((config) => {
        config.usePveMode = enabled;
      });
      await window.electron.refetchItems();
    } catch (error) {
      console.error("Failed to save user config or refetch items:", error);
    }
  };

  const handleShowTotalPriceToggle = async (enabled: boolean) => {
    setLocalShowTotalPrice(enabled);
    onShowTotalPriceChange(enabled);
    try {
      await updateConfig((config) => {
        config.showTotalPrice = enabled;
      });
    } catch (error) {
      console.error("Failed to save user config:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/95 z-50 flex justify-center overflow-y-auto max-h-screen py-4">
      <div className="bg-stone-800 rounded-lg p-4 max-w-md w-full mx-4 h-fit">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-bold text-white">
            {t("Settings", "Настройки")}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp((value) => !value)}
              className="text-white hover:text-stone-300 transition-colors px-2"
            >
              ?
            </button>
            <button
              onClick={onClose}
              className="text-white hover:text-stone-300 transition-colors text-xl"
              aria-label={t("Close settings", "Закрыть настройки")}
            >
              ×
            </button>
          </div>
        </div>

        {showHelp ? (
          <div className="text-white space-y-4">
            <h3 className="text-lg font-semibold">
              {t("Keyboard Shortcuts", "Горячие клавиши")}
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><b>F1</b><span>{t("Toggle main window", "Показать/скрыть главное окно")}</span></div>
              <div className="flex justify-between"><b>F2</b><span>{t("Delete lowest value item", "Удалить самый дешёвый предмет")}</span></div>
              <div className="flex justify-between"><b>F3</b><span>{t("Delete last scanned item", "Удалить последний предмет")}</span></div>
              <div className="flex justify-between"><b>F4</b><span>{t("Add +1 to last item", "Добавить +1 к последнему предмету")}</span></div>
              <div className="flex justify-between"><b>F6</b><span>{t("Start screen calibration", "Запустить калибровку экрана")}</span></div>
            </div>
            <p className="text-sm text-stone-300">
              {t("Project help: fleatooltip.com", "Помощь по проекту: fleatooltip.com")}
            </p>
          </div>
        ) : (
          <div className="text-white space-y-4">
            <div className="space-y-1 border-b border-stone-700 pb-4">
              <label className="text-sm font-medium">
                {t("Language", "Язык")}
              </label>
              <p className="text-xs text-stone-400">
                {t(
                  "Select the Tarkov UI/OCR language. The scanner never auto-detects between English and Russian.",
                  "Выберите язык интерфейса Tarkov и OCR. Автоопределения между русским и английским нет."
                )}
              </p>
              <select
                value={localLanguage}
                onChange={(event) =>
                  handleLanguageChange(event.target.value as AppLanguage)
                }
                className="w-full px-3 py-2 bg-stone-700 border border-stone-600 rounded-md text-white"
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
              {languageMessage && (
                <p className="text-xs text-amber-300">{languageMessage}</p>
              )}
            </div>

            <div className="space-y-3 border-b border-stone-700 pb-4">
              <SettingToggle
                label="OCR Debug Mode"
                description={t(
                  "Slowly visualizes each tooltip-detection step on screen. Requires restart.",
                  "Медленно показывает на экране каждый этап поиска игровой плашки. Требуется перезапуск."
                )}
                id="ocr-debug-toggle"
                enabled={localOcrDebugMode}
                onToggle={() => handleOcrDebugToggle(!localOcrDebugMode)}
              />
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Debug step delay
                  </label>
                  <span className="text-sm text-stone-400">
                    {localOcrDebugStepDelay} ms
                  </span>
                </div>
                <p className="text-xs text-stone-400 mb-1">
                  {t(
                    "Delay between visual debug steps (100-2000 ms).",
                    "Задержка между визуальными этапами отладки (100–2000 мс)."
                  )}
                </p>
                <input
                  type="range"
                  min="100"
                  max="2000"
                  step="100"
                  value={localOcrDebugStepDelay}
                  disabled={!localOcrDebugMode}
                  onChange={(event) =>
                    handleOcrDebugDelayChange(parseInt(event.target.value))
                  }
                  className="w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-green-500 disabled:opacity-50"
                />
              </div>
              {debugMessage && (
                <p className="text-xs text-amber-300">{debugMessage}</p>
              )}
            </div>

            <SettingToggle
              label={t("Sound Effects", "Звуковые эффекты")}
              description={t(
                "Play a sound when items are scanned",
                "Проигрывать звук при распознавании предметов"
              )}
              id="sound-toggle"
              enabled={localSoundEnabled}
              onToggle={() => handleSoundToggle(!localSoundEnabled)}
            />

            {localSoundEnabled && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    {t("Volume", "Громкость")}
                  </label>
                  <span className="text-sm text-stone-400">
                    {Math.round(localSoundVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={localSoundVolume}
                  onChange={(event) =>
                    handleVolumeChange(parseFloat(event.target.value))
                  }
                  className="w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
            )}

            <SettingToggle
              label={t("Enable Tooltips", "Подсказки цен")}
              description={t(
                "Show item price tooltips while hovering in-game",
                "Показывать цену предмета при наведении в игре"
              )}
              id="tooltips-toggle"
              enabled={localEnableTooltips}
              onToggle={() => handleTooltipsToggle(!localEnableTooltips)}
            />

            <SettingToggle
              label={t("Frameless Mode", "Режим без рамки")}
              description={t(
                "Hide the window frame and title bar",
                "Скрыть рамку и заголовок окна"
              )}
              id="frameless-toggle"
              enabled={localIsFrameless}
              onToggle={() => handleFramelessToggle(!localIsFrameless)}
            />

            <SettingToggle
              label={t("Always On Top", "Поверх других окон")}
              description={t(
                "Keep the application above other windows",
                "Держать окно приложения поверх остальных"
              )}
              id="alwaysontop-toggle"
              enabled={localEnableAlwaysOnTop}
              onToggle={() =>
                handleAlwaysOnTopToggle(!localEnableAlwaysOnTop)
              }
            />

            <div className="space-y-2">
              <div>
                <label className="text-sm font-medium">
                  {t("Tarkov Market API Key", "API-ключ Tarkov Market")}
                </label>
                <p className="text-xs text-stone-400">
                  {t("Optional", "Необязательно")}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={localTarkovMarketApiKey}
                  onChange={(event) =>
                    setLocalTarkovMarketApiKey(event.target.value)
                  }
                  placeholder={t("Enter API key...", "Введите API-ключ...")}
                  className="flex-1 px-3 min-w-0 py-1 bg-stone-700 border border-stone-600 rounded-md text-white placeholder-stone-400"
                />
                <button
                  onClick={handleApiKeyValidation}
                  disabled={isValidatingApiKey}
                  className="px-3 py-1 rounded-md bg-green-500 hover:bg-green-600 disabled:bg-stone-600"
                >
                  {isValidatingApiKey ? "…" : "✓"}
                </button>
                <button
                  onClick={handleApiKeyClear}
                  className="px-3 py-1 rounded-md bg-red-500 hover:bg-red-600"
                >
                  ×
                </button>
              </div>
              {apiKeyValidationMessage && (
                <p className="text-sm text-stone-300">
                  {apiKeyValidationMessage}
                </p>
              )}
            </div>

            <SettingToggle
              label={t("PvE Mode", "Режим PvE")}
              description={t(
                "Use PvE flea-market prices",
                "Использовать цены барахолки PvE"
              )}
              id="pve-mode-toggle"
              enabled={localUsePveMode}
              onToggle={() => handleUsePveModeToggle(!localUsePveMode)}
            />

            <SettingToggle
              label={t("Show Total Price", "Показывать общую цену")}
              description={t(
                "Show total sell value next to per-slot price",
                "Показывать полную стоимость рядом с ценой за слот"
              )}
              id="show-total-price-toggle"
              enabled={localShowTotalPrice}
              onToggle={() => handleShowTotalPriceToggle(!localShowTotalPrice)}
            />

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {t("Search Sensitivity", "Чувствительность поиска")}
                </label>
                <span className="text-sm text-stone-400">
                  {localLowestAcceptableScore}
                </span>
              </div>
              <p className="text-xs text-stone-400">
                {t(
                  "Lower = more matches, higher = stricter matching",
                  "Меньше = больше совпадений, больше = более строгий поиск"
                )}
              </p>
              <input
                type="range"
                min="5"
                max="200"
                step="1"
                value={localLowestAcceptableScore}
                onChange={(event) =>
                  handleLowestAcceptableScoreChange(
                    parseInt(event.target.value)
                  )
                }
                className="w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                {t("Border Color Override", "Цвет рамки для распознавания")}
              </label>
              <p className="text-xs text-stone-400">
                {t(
                  "RGB 0-255. Requires restart.",
                  "RGB 0–255. Требуется перезапуск."
                )}
              </p>
              <div className="flex gap-2">
                {[
                  ["red", t("Red", "Красный"), localBorderColorRed],
                  ["green", t("Green", "Зелёный"), localBorderColorGreen],
                  ["blue", t("Blue", "Синий"), localBorderColorBlue],
                ].map(([channel, label, value]) => (
                  <div className="flex-1" key={channel as string}>
                    <label className="block text-xs text-stone-300">
                      {label as string}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value={value as number}
                      onChange={(event) =>
                        handleBorderColorChange(
                          channel as "red" | "green" | "blue",
                          parseInt(event.target.value) || 0
                        )
                      }
                      className="w-full px-2 py-1 bg-stone-700 border border-stone-600 rounded-md text-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-stone-700 pt-3 space-y-3">
              <SettingToggle
                label={t("Main Window Toggle (F1)", "Главное окно (F1)")}
                description={t("Toggle main window visibility", "Показать/скрыть главное окно")}
                id="mainwindow-toggle"
                enabled={localEnableMainWindowToggle}
                onToggle={() =>
                  handleMainWindowToggle(!localEnableMainWindowToggle)
                }
              />
              <SettingToggle
                label={t("Delete Lowest Item (F2)", "Удалить самый дешёвый предмет (F2)")}
                description={t("Delete the lowest value item", "Удалить предмет с минимальной ценой")}
                id="deletelowest-toggle"
                enabled={localEnableDeleteLowestItem}
                onToggle={() =>
                  handleDeleteLowestItemToggle(!localEnableDeleteLowestItem)
                }
              />
              <SettingToggle
                label={t("Delete Last Item (F3)", "Удалить последний предмет (F3)")}
                description={t("Delete the most recently scanned item", "Удалить последний распознанный предмет")}
                id="deletelast-toggle"
                enabled={localEnableDeleteLastItem}
                onToggle={() =>
                  handleDeleteLastItemToggle(!localEnableDeleteLastItem)
                }
              />
              <SettingToggle
                label={t("Increment Last Item (F4)", "Увеличить количество последнего (F4)")}
                description={t("Add +1 to the last item", "Добавить +1 к количеству последнего предмета")}
                id="incrementlast-toggle"
                enabled={localEnableIncrementLastItem}
                onToggle={() =>
                  handleIncrementLastItemToggle(!localEnableIncrementLastItem)
                }
              />
              <SettingToggle
                label={t("Screen Calibration (F6)", "Калибровка экрана (F6)")}
                description={t("Start scanning calibration", "Запустить калибровку распознавания")}
                id="screencalibration-toggle"
                enabled={localEnableScreenCalibration}
                onToggle={() =>
                  handleScreenCalibrationToggle(!localEnableScreenCalibration)
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  id,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  id: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-stone-400">{description}</p>
      </div>
      <Toggle id={id} enabled={enabled} onToggle={onToggle} />
    </div>
  );
}
