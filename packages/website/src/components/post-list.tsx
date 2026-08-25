import type { ReactNode } from 'react';
import cx from 'classnames';
import { Link } from 'waku';

type PostListItemProps = {
  slug: string;
  title: string;
  description: string;
  author?: {
    name: string;
  };
  date?: string;
  rawDate?: string;
  release?: string | undefined;
};

const PostListItem = ({
  postItem,
  path,
  layout,
}: {
  postItem: PostListItemProps;
  path: 'blog' | 'guides';
  layout: 'list' | 'grid';
}) => (
  <li
    key={postItem.slug}
    className={cx(
      layout === 'list' && '-mx-px first:-mt-4 sm:first:-mt-6 lg:first:-mt-12',
    )}
  >
    <Link
      to={`/${path}/${postItem.slug}`}
      className="bg-gray-950/90 group block w-full rounded-xl border border-gray-800 p-2 transition-colors duration-300 ease-in-out hover:border-secondary sm:p-4 lg:p-6"
    >
      {(postItem.release || postItem.date || postItem.author) && (
        <div className="mb-6 flex items-center gap-2 whitespace-nowrap sm:gap-4">
          {postItem.release && (
            <div>
              <div className="inline-block rounded-md bg-white px-2 py-1 font-simple text-[0.625rem] font-bold text-black sm:text-xs">
                <span className="hidden uppercase sm:inline">Waku</span>{' '}
                {postItem.release}
              </div>
            </div>
          )}
          {(!!postItem.date || !!postItem.author) && (
            <div className="font-label inline-flex items-center gap-1 text-[11px] text-gray-400 sm:gap-4">
              {!!postItem.date && <span>{postItem.date}</span>}
              {!!postItem.date && !!postItem.author && (
                <span className="text-gray-600">/</span>
              )}
              {!!postItem.author && <span>{postItem.author.name}</span>}
            </div>
          )}
        </div>
      )}
      <h3 className="font-headline text-2xl leading-none sm:text-3xl">
        {postItem.title}
      </h3>
      <div className="mt-2 text-sm font-normal leading-snug text-white/60 sm:mt-1 sm:text-base">
        {postItem.description}
      </div>
    </Link>
  </li>
);

export const PostList = ({
  posts,
  path,
  layout = 'list',
}: {
  posts: PostListItemProps[];
  path: 'blog' | 'guides';
  layout?: 'list' | 'grid';
}) => (
  <ul
    className={cx(
      layout === 'grid' &&
        '-mx-4 grid grid-cols-1 gap-6 sm:-mx-6 lg:-mx-12 lg:grid-cols-2 lg:gap-8',
      layout === 'list' &&
        '-mx-4 -mt-px flex flex-col gap-6 sm:-mx-6 lg:-mx-12 lg:gap-12',
    )}
  >
    {posts.map((post) => (
      <PostListItem
        key={post.slug}
        postItem={post}
        path={path}
        layout={layout}
      />
    ))}
  </ul>
);

export const PostListContainer = ({ children }: { children: ReactNode }) => (
  <div className="xl:-right-37 relative z-10 mx-auto w-full max-w-[80ch] pt-16 text-white lg:pt-36 xl:max-w-[min(80ch,calc(100vw-296px-2rem))] 2xl:right-auto 2xl:max-w-[min(80ch,calc(100vw-296px*2-2rem))]">
    {children}
  </div>
);
