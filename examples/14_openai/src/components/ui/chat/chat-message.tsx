import { Check, Copy } from 'lucide-react';

import { JSONValue, Message } from 'ai';
import { Button } from '../button.js';
import ChatAvatar from './chat-avatar.js';
import Markdown from './markdown.js';
import { useCopyToClipboard } from './use-copy-to-clipboard.js';

interface ChatMessageImageData {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

// This component will parse message data and render the appropriate UI.
function ChatMessageData({ messageData }: { messageData: JSONValue }) {
  const { image_url, type } = messageData as unknown as ChatMessageImageData;
  if (type === 'image_url') {
    return (
      <div className="max-w-[200px] rounded-md shadow-md">
        <image
          href={image_url.url}
          width={0}
          height={0}
          style={{ width: '100%', height: 'auto' }}
        />
      </div>
    );
  }
  return null;
}

export default function ChatMessage(chatMessage: Message) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  return (
    <div className="flex items-start gap-4 pr-5 pt-5">
      <ChatAvatar role={chatMessage.role} />
      <div className="group flex flex-1 justify-between gap-2 overflow-auto">
        <div className="flex-1 space-y-4">
          {chatMessage.data && (
            <ChatMessageData messageData={chatMessage.data} />
          )}
          <Markdown content={chatMessage.content} />
        </div>
        <Button
          onClick={() => copyToClipboard(chatMessage.content)}
          size="icon"
          variant="ghost"
          className="h-8 w-8 opacity-0 group-hover:opacity-100"
        >
          {isCopied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
