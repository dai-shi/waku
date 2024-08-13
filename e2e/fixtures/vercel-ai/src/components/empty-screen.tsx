import { Button } from './ui/button.js';
import { ExternalLink } from './external-link.js';
import { IconArrowRight } from './ui/icons.js';

const exampleMessages = [
  {
    heading: 'What are the trending stocks?',
    message: 'What are the trending stocks?',
  },
  {
    heading: "What's the stock price of AAPL?",
    message: "What's the stock price of AAPL?",
  },
  {
    heading: "I'd like to buy 10 shares of MSFT",
    message: "I'd like to buy 10 shares of MSFT",
  },
];

export function EmptyScreen({
  submitMessage,
}: {
  submitMessage: (message: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="bg-background mb-4 rounded-lg border p-8">
        <h1 className="mb-2 text-lg font-semibold">
          Welcome to AI SDK 3.0 Generative UI demo!
        </h1>
        <p className="text-muted-foreground mb-2 leading-normal">
          This is a demo of an interactive financial assistant. It can show you
          stocks, tell you their prices, and even help you buy shares.
        </p>
        <p className="text-muted-foreground mb-2 leading-normal">
          The demo is built with{' '}
          <ExternalLink href="https://nextjs.org">Next.js</ExternalLink> and the{' '}
          <ExternalLink href="https://sdk.vercel.ai/docs">
            Vercel AI SDK
          </ExternalLink>
          .
        </p>
        <p className="text-muted-foreground mb-2 leading-normal">
          It uses{' '}
          <ExternalLink href="https://vercel.com/blog/ai-sdk-3-generative-ui">
            React Server Components
          </ExternalLink>{' '}
          to combine text with UI generated as output of the LLM. The UI state
          is synced through the SDK so the model is aware of your interactions
          as they happen.
        </p>
        <p className="text-muted-foreground leading-normal">Try an example:</p>
        <div className="mb-4 mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-base"
              onClick={async () => {
                submitMessage(message.message);
              }}
            >
              <IconArrowRight className="text-muted-foreground mr-2" />
              {message.heading}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground ml-auto mr-auto max-w-96 text-center text-[0.8rem] leading-normal">
        Note: Data and latency are simulated for illustrative purposes and
        should not be considered as financial advice.
      </p>
    </div>
  );
}
