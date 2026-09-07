import { useEffect } from "react";

const russianText: Record<string, string> = {
  "Initial Screen Calibration Needed": "Нужна первичная калибровка экрана",
  "Please press F6 to start the screen scanning configuration process. This is a simple 30 second process to calibrate the OCR for your screen.":
    "Нажмите F6, чтобы запустить калибровку распознавания экрана. Обычно это занимает около 30 секунд.",
  "Fetching Item Prices from Database": "Загрузка цен предметов",
  "Fetching Items from Database Failed": "Не удалось обновить цены",
  "Please try restarting the application and trying again or try again later.":
    "Не удалось получить актуальные цены. Перезапустите приложение или попробуйте снова позже.",
  "Screen Configuration Initializing": "Инициализация калибровки экрана",
  "Screen Configuration Started": "Калибровка экрана запущена",
  "Please hover over any item with the item's tooltip visible as shown below then press F6.":
    "Наведите курсор на любой предмет так, чтобы была видна игровая плашка с названием, затем нажмите F6.",
  "Scanning Single Row Dimensions": "Определение размеров плашки",
  "DON'T MOVE YOUR MOUSE": "НЕ ДВИГАЙТЕ МЫШЬ",
  "Configuration Complete": "Калибровка завершена",
  "PLEASE RESTART THIS APPLICATION TO SAVE CHANGES":
    "ПЕРЕЗАПУСТИТЕ ПРИЛОЖЕНИЕ, ЧТОБЫ ПРИМЕНИТЬ ИЗМЕНЕНИЯ",
  "If you are still running into issues, please join our Discord for help.":
    "Если проблема остаётся, обратитесь за помощью в сообщество проекта.",
  "Most Recent Item": "Последний предмет",
  Total: "Итого",
  per: "за слот",
  "Unavailable on Flea": "Недоступно на барахолке",
  "N/A": "Н/Д",
};

function translateTextNode(node: Text): void {
  const original = node.nodeValue ?? "";
  const trimmed = original.trim();
  if (!trimmed) return;

  const direct = russianText[trimmed];
  if (direct) {
    node.nodeValue = original.replace(trimmed, direct);
    return;
  }

  const overflowMatch = trimmed.match(/^(\d+) items abv$/);
  if (overflowMatch) {
    node.nodeValue = original.replace(
      trimmed,
      `${overflowMatch[1]} предм. выше`
    );
  }
}

function translateElement(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }

  if (root instanceof HTMLElement) {
    const placeholder = root.getAttribute("placeholder");
    if (placeholder === "Enter API key...") {
      root.setAttribute("placeholder", "Введите API-ключ...");
    }
  }

  root.childNodes.forEach(translateElement);
}

export default function UiTranslator(): null {
  useEffect(() => {
    let observer: MutationObserver | null = null;

    const initialize = async () => {
      try {
        const config = await window.electron.getUserConfig();
        const isRussian = (config.language ?? "en") === "ru";

        // English UI needs no DOM observer. NumberFlow is already replaced at
        // bundle time by the stable text renderer, so there is no runtime
        // compatibility work left to do here.
        if (!isRussian) {
          return;
        }

        document.documentElement.lang = "ru";
        translateElement(document.body);

        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            mutation.addedNodes.forEach(translateElement);

            if (mutation.type === "characterData") {
              translateElement(mutation.target);
            }
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      } catch (error) {
        console.error("Failed to initialize UI translation:", error);
      }
    };

    initialize();
    return () => observer?.disconnect();
  }, []);

  return null;
}
