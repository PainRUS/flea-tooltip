// import React from 'react';
import PriceList from "../components/PriceList";
import PriceUpdateStatus from "../components/PriceUpdateStatus";
import PriceColorSettings from "../components/PriceColorSettings";
import QuestTooltipSettings from "../components/QuestTooltipSettings";

export function Home() {
  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-stretch">
        <div className="flex-1 min-w-0">
          <PriceUpdateStatus />
        </div>
        <QuestTooltipSettings />
        <PriceColorSettings />
      </div>
      <div className="flex-1 min-h-0">
        <PriceList />
      </div>
    </div>
  );
}