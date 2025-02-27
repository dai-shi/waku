export type Post = {
  id: number;
  title: string;
  published: string;
  body: string;
};

export type FetchPostProps = { id: number };

export type FetchPostsProps = { start?: number; limit?: number };
