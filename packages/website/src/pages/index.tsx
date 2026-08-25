import { Destination } from '../components/destination';
import { components } from '../components/mdx';
import { Meta } from '../components/meta';
import { Page } from '../components/page';
import { RoutingTabs } from '../components/routing-tabs';
import { StarWaku } from '../components/star-waku';
import { compileMDX } from '../lib/compile-mdx';
import {
  loadAfterRouting,
  loadBeforeRouting,
  loadRoutingConfigBased,
  loadRoutingFileBased,
} from '../lib/load-routing';

export default async function HomePage() {
  // Compile each section in parallel for better build performance
  const [beforeRoutingMdx, fileBasedMdx, configBasedMdx, afterRoutingMdx] =
    await Promise.all([
      compileMDX({
        source: loadBeforeRouting(),
        components,
        options: { parseFrontmatter: true },
      }),
      compileMDX({
        source: loadRoutingFileBased(),
        components,
        options: { parseFrontmatter: true },
      }),
      compileMDX({
        source: loadRoutingConfigBased(),
        components,
        options: { parseFrontmatter: true },
      }),
      compileMDX({
        source: loadAfterRouting(),
        components,
        options: { parseFrontmatter: true },
      }),
    ]);

  return (
    <Page isHome={true}>
      <Meta
        title="Waku, the minimal React framework"
        description="A lightweight React server components framework with a fun developer experience."
      />
      {/* <div className="relative flex h-svh w-full flex-col items-center justify-center overflow-clip font-sans">
        <Start />
        <div className="sr-only" suppressHydrationWarning>
          {new Date().toISOString()}
        </div>
      </div> */}
      <div
        id="content"
        className="xl:-right-37 relative z-10 mx-auto w-full max-w-[80ch] scroll-mt-16 pt-16 lg:scroll-mt-32 lg:pt-32 xl:max-w-[min(80ch,calc(100vw-296px-2rem))] 2xl:right-auto 2xl:max-w-[min(80ch,calc(100vw-296px*2-2rem))]"
      >
        {beforeRoutingMdx.content}
        <h2
          id="routing"
          className="mb-2 mt-16 scroll-mt-16 text-balance text-3xl font-bold leading-none text-white first:mt-0 sm:text-[2.75rem] xl:mt-20 xl:scroll-mt-20"
        >
          <a href="#routing">Routing</a>
        </h2>
        <RoutingTabs
          fileBasedContent={fileBasedMdx.content}
          configBasedContent={configBasedMdx.content}
        />
        {afterRoutingMdx.content}
      </div>
      <div className="xl:-right-37 relative z-10 mx-auto mb-8 mt-16 flex w-full max-w-[80ch] justify-center sm:mb-0 lg:mt-32 xl:max-w-[min(80ch,calc(100vw-296px-2rem))] 2xl:right-auto 2xl:max-w-[min(80ch,calc(100vw-296px*2-2rem))]">
        <StarWaku />
      </div>
      {/* <div id="nudge" className="absolute top-px inline-block size-px" /> */}
      <Destination />
    </Page>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
