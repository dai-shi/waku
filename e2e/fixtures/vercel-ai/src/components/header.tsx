import { Link } from 'waku/router/client';

import {
  IconGitHub,
  IconSeparator,
  IconSparkles,
  IconVercel,
} from './ui/icons.js';
import { Button } from './ui/button.js';

export async function Header() {
  return (
    <header className="bg-background sticky top-0 z-50 flex h-14 w-full shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl">
      <span className="home-links inline-flex items-center whitespace-nowrap">
        <a href="https://vercel.com" rel="noreferrer" target="_blank">
          <IconVercel className="h-5 w-5 sm:h-6 sm:w-6" />
        </a>
        <IconSeparator className="text-muted-foreground/20 h-6 w-6" />
        <Link to="/">
          <span className="text-lg font-bold">
            <IconSparkles className="mb-0.5 mr-0 inline w-4 sm:w-5" />
            AI
          </span>
        </Link>
      </span>
      <div className="flex items-center justify-end space-x-2">
        <Button variant="outline" asChild>
          <a
            target="_blank"
            href="https://github.com/vercel/ai/tree/main/examples/next-ai-rsc"
            rel="noopener noreferrer"
          >
            <IconGitHub />
            <span className="ml-2 hidden md:flex">GitHub</span>
          </a>
        </Button>
        <Button asChild>
          <a
            href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Fblob%2Fmain%2Fexamples%2Fnext-ai-rsc&env=OPENAI_API_KEY&envDescription=OpenAI+API+Key&envLink=https%3A%2F%2Fplatform.openai.com%2Fapi-keys"
            target="_blank"
            rel="noreferrer"
          >
            <IconVercel className="mr-2" />
            <span className="hidden sm:block">Deploy to Vercel</span>
            <span className="sm:hidden">Deploy</span>
          </a>
        </Button>
      </div>
    </header>
  );
}
