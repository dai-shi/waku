import type { PageProps } from 'waku/router';

// Type-level assertions only; never called. CreatePagesConfig.pages is augmented
// by the generated pages.gen.ts, so a known route literal resolves to typed
// props while an unknown one is rejected at the type parameter. fs-router emits
// every path as a string literal (including catch-all and nested segments), so
// the union never widens to `string` and validation stays active for all shapes.
export function assertPagePropsTyping(
  staticProps: PageProps<'/bar'>,
  dynamicProps: PageProps<'/nested/[name]'>,
  nestedSegmentProps: PageProps<'/page-with-segment/article/[slug]'>,
  catchAllProps: PageProps<'/subroute/[...catchAll]'>,
) {
  void staticProps.path;
  void dynamicProps.name;
  void nestedSegmentProps.slug;
  const segments: string[] = catchAllProps.catchAll;
  void segments;
}

// @ts-expect-error an unknown route literal is not a known page path
export type InvalidPageProps = PageProps<'/no-such-route'>;
// @ts-expect-error a wrong slug name does not match the known dynamic route
export type WrongSlugPageProps = PageProps<'/nested/[wrong]'>;
// @ts-expect-error a wrong catch-all name is rejected even with a catch-all route present
export type WrongCatchAllProps = PageProps<'/subroute/[...wrong]'>;
