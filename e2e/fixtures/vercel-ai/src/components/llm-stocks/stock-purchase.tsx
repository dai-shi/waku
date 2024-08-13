'use client';

import { useId, useState } from 'react';
import { useActions, useAIState, useUIState } from 'ai/rsc';
import { formatNumber } from '../../lib/utils/index.js';
import type { AI } from '../../actions/index.js';

export function Purchase({
  defaultAmount,
  name,
  price,
}: {
  defaultAmount?: number;
  name: string;
  price: number;
}) {
  const [value, setValue] = useState(defaultAmount || 100);
  const [purchasingUI, setPurchasingUI] = useState<null | React.ReactNode>(
    null,
  );
  const [history, setHistory] = useAIState<typeof AI>();
  const [, setMessages] = useUIState<typeof AI>();
  const { confirmPurchase } = useActions<typeof AI>();

  // Unique identifier for this UI component.
  const id = useId();

  // Whenever the slider changes, we need to update the local value state and the history
  // so LLM also knows what's going on.
  function onSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = Number(e.target.value);
    setValue(newValue);

    // Insert a hidden history info to the list.
    const info = {
      role: 'system' as const,
      content: `[User has changed to purchase ${newValue} shares of ${name}. Total cost: $${(
        newValue * price
      ).toFixed(2)}]`,

      // Identifier of this UI component, so we don't insert it many times.
      id,
    };

    // If last history state is already this info, update it. This is to avoid
    // adding every slider change to the history.
    if (history[history.length - 1]?.id === id) {
      setHistory([...history.slice(0, -1), info]);
      return;
    }

    // If it doesn't exist, append it to history.
    setHistory([...history, info]);
  }

  return (
    <div className="text-green-400 bg-zinc-950 rounded-xl border p-4">
      <div className="float-right inline-block rounded-full bg-white/10 px-2 py-1 text-xs">
        +1.23% ↑
      </div>
      <div className="text-zinc-300 text-lg">{name}</div>
      <div className="text-3xl font-bold">${price}</div>
      {purchasingUI ? (
        <div className="text-zinc-200 mt-4">{purchasingUI}</div>
      ) : (
        <>
          <div className="relative mt-6 pb-6">
            <p>Shares to purchase</p>
            <input
              id="labels-range-input"
              type="range"
              value={value}
              onChange={onSliderChange}
              min="10"
              max="1000"
              className="bg-zinc-600 accent-green-500 dark:bg-zinc-700 h-1 w-full cursor-pointer appearance-none rounded-lg"
            />
            <span className="text-zinc-400 absolute bottom-1 start-0 text-xs">
              10
            </span>
            <span className="text-zinc-400 absolute bottom-1 start-1/3 -translate-x-1/2 text-xs rtl:translate-x-1/2">
              100
            </span>
            <span className="text-zinc-400 absolute bottom-1 start-2/3 -translate-x-1/2 text-xs rtl:translate-x-1/2">
              500
            </span>
            <span className="text-zinc-400 absolute bottom-1 end-0 text-xs">
              1000
            </span>
          </div>

          <div className="mt-6">
            <p>Total cost</p>
            <div className="flex flex-wrap items-center text-xl font-bold sm:items-end sm:gap-2 sm:text-3xl">
              <div className="flex basis-1/3 flex-col tabular-nums sm:basis-auto sm:flex-row sm:items-center sm:gap-2">
                {value}
                <span className="text-zinc-600 dark:text-zinc-400 mb-1 text-sm font-normal sm:mb-0">
                  shares
                </span>
              </div>
              <div className="basis-1/3 text-center sm:basis-auto">×</div>
              <span className="flex basis-1/3 flex-col tabular-nums sm:basis-auto sm:flex-row sm:items-center sm:gap-2">
                ${price}
                <span className="text-zinc-600 dark:text-zinc-400 mb-1 ml-1 text-sm font-normal sm:mb-0">
                  per share
                </span>
              </span>
              <div className="border-t-zinc-700 mt-2 basis-full border-t pt-2 text-center sm:mt-0 sm:basis-auto sm:border-0 sm:pt-0 sm:text-left">
                = <span>{formatNumber(value * price)}</span>
              </div>
            </div>
          </div>

          <button
            className="bg-green-500 dark:bg-green-500 text-zinc-900 mt-6 w-full rounded-lg px-4 py-2"
            onClick={async () => {
              const response = await confirmPurchase(name, price, value);
              setPurchasingUI(response.purchasingUI);

              // Insert a new system message to the UI.
              setMessages((currentMessages: any) => [
                ...currentMessages,
                response.newMessage,
              ]);
            }}
          >
            Purchase
          </button>
        </>
      )}
    </div>
  );
}
