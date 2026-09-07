import React, { useEffect, useState } from "react";
import { AppLanguage, UserConfig } from "../../models/UserConfig";

export default function QuestTooltipVisibility() {
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [showIndicator, setShowIndicator] = useState(true);
  const [showTaskNames, setShowTaskNames] = useState(false);

  const applyConfig = (config: UserConfig) => {
    setLanguage(config.language ?? "en");
    setShowIndicator(config.showQuestNeedIndicator ?? true);
    setShowTaskNames(config.showQuestTaskNames ?? false);
  };

  useEffect(() => {
    window.electron
      .getUserConfig()
      .then(applyConfig)
      .catch((error) =>
        console.error("Failed to load quest tooltip visibility:", error)
      );

    window.electron.onConfigChanged(applyConfig);
  }, []);

  if (showIndicator && showTaskNames) {
    return null;
  }

  const label = language === "ru" ? "✓ Нужен для заданий" : "✓ Needed for tasks";
  const escapedLabel = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  return (
    <style>{`
      #tooltip-card-layer > div > div:nth-child(n+4) {
        display: none !important;
      }
      ${
        showIndicator
          ? `#tooltip-card-layer > div:has(> div:nth-child(4))::after {
              content: "${escapedLabel}";
              display: block;
              width: max-content;
              white-space: nowrap;
              margin-top: 1px;
              color: #16a34a;
            }`
          : ""
      }
    `}</style>
  );
}