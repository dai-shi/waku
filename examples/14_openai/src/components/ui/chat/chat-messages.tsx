import { useEffect, useRef } from 'react';

import ChatActions from './chat-actions.js';
import ChatMessage from './chat-message.js';
import { ChatHandler } from './chat.interface.js';

export default function ChatMessages(
  props: Pick<
    ChatHandler,
    'messages' | 'isLoading' | 'reload' | 'stop' | 'clear'
  >,
) {
  const scrollableChatContainerRef = useRef<HTMLDivElement>(null);
  const messageLength = props.messages.length;
  const lastMessage = props.messages[messageLength - 1];

  const scrollToBottom = () => {
    if (scrollableChatContainerRef.current) {
      scrollableChatContainerRef.current.scrollTop =
        scrollableChatContainerRef.current.scrollHeight;
    }
  };

  const isLastMessageFromAssistant =
    messageLength > 0 && lastMessage?.role !== 'user';
  const showClear = props.clear && messageLength > 0;
  const showReload =
    props.reload && !props.isLoading && isLastMessageFromAssistant;
  const showStop = props.stop && props.isLoading;

  useEffect(() => {
    scrollToBottom();
  }, [messageLength, lastMessage]);

  return (
    <div className="w-full rounded-xl bg-white p-4 pb-0 shadow-xl">
      <div
        className="flex h-[50vh] flex-col gap-5 divide-y overflow-y-auto pb-4"
        ref={scrollableChatContainerRef}
      >
        {props.messages.map((m) => (
          <ChatMessage key={m.id} {...m} />
        ))}
      </div>
      <div className="flex justify-end py-4">
        <ChatActions
          clear={props.clear}
          reload={props.reload}
          stop={props.stop}
          showClear={showClear}
          showReload={showReload}
          showStop={showStop}
        />
      </div>
    </div>
  );
}
