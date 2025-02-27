'use server';

import { FetchPostProps, Post } from "./types";

async function generatePost(creationDelay = 1): Promise<Post> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const t = new Date();
      t.setMilliseconds(0);
      t.setDate(t.getDate() + getRandomNumber(0, 365));
      t.setSeconds(t.getSeconds() + getRandomNumber(-86400, 86400));
      resolve({
        id: posts.length + 1,
        title: getRandomText(getRandomNumber(3, 6)),
        published: new Date().toISOString(),
        body: getRandomText(getRandomNumber(150, 300)),
      });
    }, creationDelay);
  });
}

function getRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomText(wordCount = 255): string {
  const words = [];
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < wordCount; i++) {
    let word = '';
    const wordLength = getRandomNumber(3, 10);
    for (let j = 0; j < wordLength; j++) {
      word += characters.charAt(getRandomNumber(0, characters.length - 1));
    }
    words.push(word);
  }
  return words.join(' ');
}

const posts: Post[] = [];

export async function fetchPosts(props: FetchPostsProps = {}) {
  const { start = 0, limit = 50 } = props;
  const end = start + limit;
  while (posts.length < end) {
    posts.push(await generatePost());
  }
  return posts
    .slice(start, end)
    .map(
      (post) => ({ ...post, body: `${post.body.slice(0, 100)}...` }) as Post,
    );
}

export async function fetchPost({ id }: FetchPostProps) {
  if (id in posts && posts[id]) {
    return posts[id];
  }
  return undefined;
}

export async function update(id = 0, body = '') {
  if (id in posts && posts[id]) {
    posts[id].body = body;
    return fetchPost({ id });
  }
  return undefined;
}
