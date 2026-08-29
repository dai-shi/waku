// Navigation API rejects `finished` with AbortError for a superseded
// navigation; the host contract treats that as settlement, not failure.

export const settleNavigateFinished = async (
  finished: Promise<unknown> | undefined,
): Promise<void> => {
  try {
    await finished;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }
    throw error;
  }
};
