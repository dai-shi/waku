export const greet = async (name: string) => {
  await Promise.resolve();
  return `Hello ${name} from server!`;
};
