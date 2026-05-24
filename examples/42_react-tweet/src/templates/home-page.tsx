import { EmbeddedTweet, TweetNotFound } from 'react-tweet';
import { getTweet } from 'react-tweet/api';
import type { Tweet } from 'react-tweet/api';

// Workaround for https://github.com/vercel/react-tweet/issues/218: Twitter's syndication API stopped returning empty arrays for missing entity types.
const normalizeTweetEntities = (
  tweet: Tweet | undefined,
): Tweet | undefined => {
  if (!tweet) {
    return tweet;
  }
  const t = tweet as Record<string, any>;
  const e = (t.entities ?? {}) as Record<string, unknown>;
  t.entities = {
    ...e,
    hashtags: e.hashtags ?? [],
    user_mentions: e.user_mentions ?? [],
    urls: e.urls ?? [],
    symbols: e.symbols ?? [],
  };
  if (t.quoted_tweet) {
    normalizeTweetEntities(t.quoted_tweet as Tweet);
  }
  if (t.parent) {
    normalizeTweetEntities(t.parent as Tweet);
  }
  return tweet;
};

export const HomePage = async () => {
  const data = await getData();
  const tweet = normalizeTweetEntities(
    await getTweet('1735308967880823082').catch(() => undefined),
  );

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      {tweet ? <EmbeddedTweet tweet={tweet} /> : <TweetNotFound />}
    </div>
  );
};

const getData = async () => {
  const data = {
    title: 'Waku',
    headline: 'Waku',
  };

  return data;
};
