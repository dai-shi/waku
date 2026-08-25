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
        url: `https://x.com/razorbelle/all`,
      };
    case 'tyler':
      return {
        name: 'Tyler Lawson',
        biography: 'senior engineer at second spectrum',
        avatar: 'https://avatars.githubusercontent.com/u/26290074',
        url: 'https://tyler.fun',
      };
    case 'hiroshi':
      return {
        name: 'Hiroshi Ogawa',
        biography: 'Vitest & Vite team member',
        avatar: 'https://github.com/hi-ogawa.png',
        url: 'https://github.com/hi-ogawa',
      };
    case 'robmarscher':
      return {
        name: 'Rob Marscher',
        biography: 'principal software engineer at 100x',
        avatar: 'https://github.com/rmarscher.png',
        url: 'https://robmarscher.com',
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
