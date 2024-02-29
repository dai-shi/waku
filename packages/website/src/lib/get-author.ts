export const getAuthor = (author: string) => {
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
    default:
      return {
        name: ``,
        biography: ``,
        avatar: ``,
      };
  }
};
