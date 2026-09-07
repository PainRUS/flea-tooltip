import React from "react";
import { ClientItem } from "../../models/Item";

export default function MostRecentItem({ item }: { item: ClientItem | null }) {
  return (
    <div className="h-[150px] w-full">
      <div className="font-['Nunito'] text-xl font-bold">Most Recent Item</div>
      {item && (
        <div className="grid grid-cols-4 py-1">
          <div className="w-28 h-28">
            <img
              className="max-w-full max-h-full object-contain"
              src={item.icon}
            />
          </div>

          <div className="col-span-3 pl-2">
            <div className="text-xl font-semibold">{item.searchName}</div>
          </div>
        </div>
      )}
    </div>
  );
}
