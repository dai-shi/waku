'use server';

export const throws = async (input: string): Promise<string> => {
  if (!input) {
    throw new Error('Input is required');
  }
  return input;
};
