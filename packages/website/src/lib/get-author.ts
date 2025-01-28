type Author = {
  name: string;
  biography: string;
  avatar: string;
  url: string;
};

export const getAuthor = (author: string): Author => {
  switch (author) {
    case 'daishi':
      return {
        name: `Daishi Kato`,
        biography: `author of Zustand and Jotai`,
        avatar: `https://cdn.candycode.com/waku/daishi.png`,
        url: `https://x.com/dai_shi`,
      };
    case 'sophia':
      return {
        name: `Sophia Andren`,
        biography: `technical director of candycode`,
        avatar: `https://cdn.candycode.com/waku/sophia.png`,
        url: `https://x.com/razorbelle`,
      };
    case 'tyler':
      return {
        name: 'Tyler Lawson',
        biography: 'senior engineer at second spectrum',
        avatar: 'https://avatars.githubusercontent.com/u/26290074',
        url: 'https://tylur.dev',
      };
    default:
      return {
        name: ``,
        biography: ``,
        avatar: ``,
        url: '',
      };
  }
};
