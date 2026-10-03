// This is node.js specific code
export const createProgressLogger = (total?: number) => {
  const showProgress = process.stdout.isTTY && !process.env.CI;
  let count = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const INTERVAL = 100; // rate limit updates to every 100ms

  const getPrefix = () =>
    total !== undefined ? `(${count}/${total}) ` : `(${count}) `;

  const update = (message: string) => {
    count++;
    if (timer) {
      return;
    }
    timer = setTimeout(() => (timer = null), INTERVAL);
    if (showProgress) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(getPrefix() + message);
    }
  };

  const done = () => {
    if (showProgress) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
  };

  const getCount = () => count;

  return { update, done, getCount };
};
