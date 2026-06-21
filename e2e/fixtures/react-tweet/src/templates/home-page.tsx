import { TweetNotFound } from 'react-tweet';
import { getTweet } from 'react-tweet/api';

export const HomePage = async () => (
  <main>
    <title>Waku react-tweet</title>
    <h1>react-tweet fixture</h1>
    <p data-testid="tweet-api-type">{typeof getTweet}</p>
    <TweetNotFound />
  </main>
);
