// wakujs/waku#2288: module-level state shared by the page and the action
const counts: Record<string, number> = {};

export const getRerenderOrderCount = (mode: string) => counts[mode] ?? 0;

export const incrementRerenderOrderCount = (mode: string) => {
  counts[mode] = (counts[mode] ?? 0) + 1;
};
