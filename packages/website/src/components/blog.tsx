import { Link } from 'waku/router/client';

import { Article } from './article.js';
import { Credits } from './credits.js';

export const Blog = () => {
  return (
    <div className="relative flex min-h-[100svh] w-full flex-col items-center justify-center overflow-clip font-sans">
      <div className="fixed inset-0 z-0 sm:-inset-8">
        <img
          src="https://cdn.candycode.com/waku/background.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="fixed inset-0 z-10 h-full w-full bg-gradient-radial from-transparent to-black/25" />
      <Link href="/">
        <span className="fixed bottom-0 left-0 z-50 p-4 py-8 text-white sm:p-8 lg:top-0">
          <h1 className="font-serif text-3xl font-extrabold leading-none transition duration-300 hover:opacity-100 lg:opacity-50">
            ⛩️ Home
          </h1>
        </span>
      </Link>
      <div className="pointer-events-none relative z-50 p-4 pb-44 sm:p-8 lg:py-32">
        <div className="pointer-events-auto inline-block overflow-clip rounded-2xl border-8 border-gray-950 bg-gray-900/90 p-2 backdrop-blur">
          <div className="w-full max-w-xs p-3 text-left text-white sm:max-w-4xl sm:p-6 lg:p-10">
            <h2 className="mb-1 text-3xl font-bold leading-none sm:text-[2.75rem]">
              Introducing Waku
            </h2>
            <div className="mb-3 text-base leading-tight text-gray-400 sm:text-xl sm:text-gray-300">
              Learn about the minimal React framework and how it enables RSC
              features.
            </div>
            <div className="mb-6 flex items-center gap-2 font-bold text-red-400 sm:mb-12">
              <div className="relative h-8 w-8 overflow-clip rounded-full border border-red-400 ">
                <img
                  src="https://storage.googleapis.com/candycode/jotai/daishi.png"
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <div className="text-sm sm:text-base">
                by Daishi Kato, author of Zustand and Jotai
              </div>
            </div>
            <Article />
          </div>
        </div>
      </div>
      <Credits />
    </div>
  );
};
