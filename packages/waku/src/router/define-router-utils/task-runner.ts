export const createTaskRunner = (limit: number) => {
  let running = 0;
  const waiting: (() => void)[] = [];
  const scheduleTask = async (task: () => Promise<void>) => {
    while (running >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running++;
    try {
      await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
  const tasks: Promise<void>[] = [];
  const runTask = (task: () => Promise<void>): void => {
    tasks.push(scheduleTask(task));
  };
  const waitForTasks = async () => {
    await Promise.all(tasks);
  };
  return { runTask, waitForTasks };
};
