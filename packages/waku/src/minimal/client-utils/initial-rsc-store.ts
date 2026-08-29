type Elements = Record<string | symbol, unknown>;

type InitialRscEntry = [
  rscPath: string,
  rscParams: unknown,
  elements: Promise<Elements>,
];

// An abandoned suspended render has no cleanup, so this cache must be bounded.
const INITIAL_RSC_ENTRY_LIMIT = 32;
const initialRscEntries: InitialRscEntry[] = [];

export const clearInitialRscEntries = (): void => {
  initialRscEntries.length = 0;
};

export const getInitialRscEntry = (
  rscPath: string,
  rscParams: unknown,
  create: () => Promise<Elements>,
): Promise<Elements> => {
  const index = initialRscEntries.findIndex(
    (item) => item[0] === rscPath && item[1] === rscParams,
  );
  if (index !== -1) {
    const entry = initialRscEntries[index]!;
    initialRscEntries.splice(index, 1);
    initialRscEntries.push(entry);
    return entry[2];
  }
  const elements = create();
  if (initialRscEntries.length === INITIAL_RSC_ENTRY_LIMIT) {
    void initialRscEntries.shift();
  }
  initialRscEntries.push([rscPath, rscParams, elements]);
  void elements.then(undefined, () => {
    releaseInitialRscEntry(rscPath, rscParams, elements);
  });
  return elements;
};

export const releaseInitialRscEntry = (
  rscPath: string,
  rscParams: unknown,
  elements: Promise<Elements>,
): void => {
  const index = initialRscEntries.findIndex(
    (item) =>
      item[0] === rscPath && item[1] === rscParams && item[2] === elements,
  );
  if (index !== -1) {
    initialRscEntries.splice(index, 1);
  }
};
