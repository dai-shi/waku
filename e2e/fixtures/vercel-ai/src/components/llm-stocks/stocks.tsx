'use client';

import { useActions, useUIState } from 'ai/rsc';
import type { AI } from '../../actions/index.js';

export function Stocks({ stocks }: { stocks: any[] }) {
  const [, setMessages] = useUIState<typeof AI>();
  const { submitUserMessage } = useActions<typeof AI>();

  return (
    <div className="mb-4 flex flex-col gap-2 overflow-y-scroll pb-4 text-sm sm:flex-row">
      {stocks.map((stock) => (
        <button
          key={stock.symbol}
          className="bg-zinc-900 hover:bg-zinc-800 flex cursor-pointer flex-row gap-2 rounded-lg p-2 text-left sm:w-52"
          onClick={async () => {
            const response = await submitUserMessage(`View ${stock.symbol}`);
            setMessages((currentMessages) => [...currentMessages, response]);
          }}
        >
          <div
            className={`text-xl ${
              stock.delta > 0 ? 'text-green-600' : 'text-red-600'
            } flex w-11 flex-row justify-center rounded-md bg-white/10 p-2`}
          >
            {stock.delta > 0 ? '↑' : '↓'}
          </div>
          <div className="flex flex-col">
            <div className="text-zinc-300 bold uppercase">{stock.symbol}</div>
            <div className="text-zinc-500 text-base">${stock.price}</div>
          </div>
          <div className="ml-auto flex flex-col">
            <div
              className={`${
                stock.delta > 0 ? 'text-green-600' : 'text-red-600'
              } bold text-right uppercase`}
            >
              {` ${((stock.delta / stock.price) * 100).toFixed(2)}%`}
            </div>
            <div
              className={`${
                stock.delta > 0 ? 'text-green-700' : 'text-red-700'
              } text-right text-base`}
            >
              {stock.delta}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
