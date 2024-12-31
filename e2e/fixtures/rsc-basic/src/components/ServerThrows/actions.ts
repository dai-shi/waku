'use server';

export const throws = async (): Promise<string> => {
  throw new Error('Something unexpected happened');
};
