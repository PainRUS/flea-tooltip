// import React from 'react';
import PriceList from "../components/PriceList";
import PriceUpdateStatus from "../components/PriceUpdateStatus";

export function Home() {
  return (
    <div className="relative flex flex-col h-full min-h-0">
      <PriceUpdateStatus />
      <div className="flex-1 min-h-0">
        <PriceList />
      </div>
    </div>
  );
}
