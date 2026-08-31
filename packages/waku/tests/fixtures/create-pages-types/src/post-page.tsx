import type { PageProps } from 'waku/router';

export const PostPage = (props: PageProps<'/posts/[id]'>) => {
  // @ts-expect-error the route has no slug named "missing"
  void props.missing;
  return <p>{props.id}</p>;
};
