'use server';

export const ping = async () => {
  return 'pong';
};

export const increase = async (value: number) => {
  return value + 1;
};
