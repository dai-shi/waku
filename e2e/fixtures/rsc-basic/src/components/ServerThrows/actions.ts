'use server';

export const throws = async (input: string): Promise<string> => {
  if (!input) {
    throw new Error('Something unexpected happened');
  }
  return input;
};
