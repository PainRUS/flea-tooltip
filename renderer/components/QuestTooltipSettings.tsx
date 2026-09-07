import React, { useEffect, useState } from "react";
import { AppLanguage } from "../../models/UserConfig";

export default function QuestTooltipSettings() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [showIndicator, setShowIndicator] = useState(true);
  const [showTaskNames, setShowTaskNames] = useState(false);
  const [message, setMessage] = useState("");

  const ru = language === "ru";
  const t = (en: string, russian: string) => (ru ? russian : en);

  const loadConfig = async () => {
    try {
      const config = await window.electron.getUserConfig();
      setLanguage(config.language ?? "en");
      setShowIndicator(config.showQuestNeedIndicator ?? true);
      setShowTaskNames(config.showQuestTaskNames ?? false);
    } catch (error) {
      console.error("Failed to load quest tooltip settings:", error);
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

  const save = async () => {
    try {
      const config = await window.electron.getUserConfig();
      config.showQuestNeedIndicator = showIndicator;
      config.showQuestTaskNames = showIndicator ? showTaskNames : false;
      await window.electron.setUserConfig(config);
      setShowTaskNames(showIndicator ? showTaskNames : false);
      setMessage(t("Saved", "Сохранено"));
    } catch (error) {
      console.error("Failed to save quest tooltip settings:", error);
      setMessage(t("Failed to save", "Не удалось сохранить"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 px-2 py-1 text-[11px] font-bold bg-stone-700 hover:bg-stone-600 border-b border-l border-stone-600 whitespace-nowrap"
        title={t("Configure task information in the tooltip", "Настроить информацию о заданиях в подсказке")}
      >
        {t("Tasks", "Задания")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/90 p-4">
          <div className="w-full max-w-md rounded-lg bg-stone-800 p-4 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">
                  {t("Task information", "Информация о заданиях")}
                </h2>
                <p className="text-xs text-stone-400">
                  {t(
                    "Choose how task requirements are shown in the in-game price tooltip.",
                    "Выберите, как необходимость предмета для заданий отображается в игровой подсказке цены."
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

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-4 rounded bg-stone-700/60 px-3 py-3">
                <div>
                  <div className="text-sm font-semibold">
                    {t("Show task-needed marker", "Показывать, что предмет нужен для заданий")}
                  </div>
                  <div className="text-xs text-stone-400">
                    {t(
                      "Shows a compact marker only when the item is required for at least one task.",
                      "Показывает компактную отметку только если предмет нужен хотя бы для одного задания."
                    )}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={showIndicator}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setShowIndicator(enabled);
                    if (!enabled) setShowTaskNames(false);
                    setMessage("");
                  }}
                  className="h-4 w-4 shrink-0 accent-green-500"
                />
              </label>

              <label
                className={`flex items-center justify-between gap-4 rounded px-3 py-3 ${
                  showIndicator ? "bg-stone-700/60" : "bg-stone-800 opacity-50"
                }`}
              >
                <div>
                  <div className="text-sm font-semibold">
                    {t("Show task names", "Показывать названия заданий")}
                  </div>
                  <div className="text-xs text-stone-400">
                    {t(
                      "Expands the compact marker into the existing list with quantity and task names. Disabled by default.",
                      "Вместо компактной отметки показывает существующий список с количеством и названиями заданий. По умолчанию выключено."
                    )}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={showTaskNames}
                  disabled={!showIndicator}
                  onChange={(event) => {
                    setShowTaskNames(event.target.checked);
                    setMessage("");
                  }}
                  className="h-4 w-4 shrink-0 accent-green-500 disabled:cursor-not-allowed"
                />
              </label>
            </div>

            <div className="mt-3 rounded bg-stone-900/50 px-3 py-2 text-xs text-stone-300">
              {showIndicator
                ? showTaskNames
                  ? t(
                      "Preview: detailed task list will be shown.",
                      "Пример: будет показан подробный список заданий."
                    )
                  : t(
                      "Preview: ✓ Needed for tasks",
                      "Пример: ✓ Нужен для заданий"
                    )
                : t(
                    "Preview: task information is hidden.",
                    "Пример: информация о заданиях скрыта."
                  )}
            </div>

            {message && (
              <div className="mt-3 text-center text-xs text-amber-300">
                {message}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
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
      )}
    </>
  );
}