'use client';

import { chatAtoms } from 'jotai-ai';
import { ChatInput, ChatMessages } from './ui/chat/index.js';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { Suspense, useCallback } from 'react';
import { atom } from 'jotai/vanilla';
import { atomWithStorage } from 'jotai/utils';
import { toast } from 'sonner';

const {
  messagesAtom,
  inputAtom,
  submitAtom,
  isLoadingAtom,
  reloadAtom,
  stopAtom,
} = chatAtoms({
  api: '/api/chat',
});

const apiKeyAtom = atomWithStorage<string | null>('api-key', null);

const clearMessagesAtom = atom(null, async (_, set) => set(messagesAtom, []));

const Messages = () => {
  const messages = useAtomValue(messagesAtom);
  const isLoading = useAtomValue(isLoadingAtom);
  const clear = useSetAtom(clearMessagesAtom);
  const reload = useSetAtom(reloadAtom);
  const stop = useSetAtom(stopAtom);
  return (
    <ChatMessages
      messages={messages}
      isLoading={isLoading}
      clear={clear}
      reload={reload}
      stop={stop}
    />
  );
};

export default function ChatSection() {
  const [input, handleInputChange] = useAtom(inputAtom);
  const [apiKey, setApiKey] = useAtom(apiKeyAtom);
  const handleSubmit = useSetAtom(submitAtom);
  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!apiKey) {
        toast.error('API Key is required');
        return;
      }
      return handleSubmit(e, {
        data: {
          apiKey,
        },
      })?.catch((err) => {
        toast.error(err.message);
      });
    },
    [apiKey, handleSubmit],
  );
  const isLoading = useAtomValue(isLoadingAtom);

  return (
    <div className="w-full max-w-5xl space-y-4">
      <div className="flex space-x-4">
        <input
          name="openai-api-key"
          type="password"
          value={apiKey || ''}
          onChange={useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) =>
              setApiKey(e.target.value),
            [setApiKey],
          )}
          placeholder="OpenAPI Key"
          className="w-full rounded-xl p-4 shadow-xl"
        />
        <button
          onClick={useCallback(() => setApiKey(null), [setApiKey])}
          className="bg-red-500 rounded-xl p-4 text-white shadow-xl"
        >
          Clear
        </button>
      </div>
      <Suspense
        fallback={
          <div className="w-full rounded-xl bg-white p-4 pb-0 shadow-xl">
            <div className="flex h-[50vh] flex-col gap-5 divide-y overflow-y-auto pb-4">
              <div className="flex animate-pulse space-x-4">
                <div className="flex-1 space-y-4 py-1">
                  <div className="space-y-2">
                    <div className="h-4 w-3/4 rounded bg-gray-200"></div>
                    <div className="h-4 w-5/6 rounded bg-gray-200"></div>
                    <div className="h-4 w-4/6 rounded bg-gray-200"></div>
                    <div className="h-4 w-3/4 rounded bg-gray-200"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      >
        <Messages />
      </Suspense>
      <ChatInput
        input={input}
        handleSubmit={onSubmit}
        handleInputChange={handleInputChange}
        isLoading={isLoading}
      />
    </div>
  );
}
