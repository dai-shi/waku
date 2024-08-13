'use client';

import { StockSkeleton } from './stock-skeleton.js';
import { StocksSkeleton } from './stocks-skeleton.js';
import { EventsSkeleton } from './events-skeleton.js';

export { spinner } from './spinner.js';
export { BotCard, BotMessage, SystemMessage } from './message.js';

const Stock = StockSkeleton;

const Purchase = (_props: any) => (
  <div className="bg-zinc-900 rounded-lg px-4 py-5 text-center text-xs">
    Loading stock info...
  </div>
);

const Stocks = StocksSkeleton;

const Events = EventsSkeleton;

export { Stock, Purchase, Stocks, Events };
