"use client";

import { StockSkeleton } from "./stock-skeleton";
import { StocksSkeleton } from "./stocks-skeleton";
import { EventsSkeleton } from "./events-skeleton";

export { spinner } from "./spinner";
export { BotCard, BotMessage, SystemMessage } from "./message";

const Stock = StockSkeleton

const Purchase = (props: any) => (
  <div className="bg-zinc-900 rounded-lg px-4 py-5 text-center text-xs">
    Loading stock info...
  </div>
)

const Stocks = StocksSkeleton;

const Events = EventsSkeleton;

export { Stock, Purchase, Stocks, Events };
