'use server';

export const getServerTime = async () => {
  // Wait for 1 second
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // Return the current time
  return new Date().toISOString();
};
