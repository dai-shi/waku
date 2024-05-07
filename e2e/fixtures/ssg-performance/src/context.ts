import { cache } from 'react';

// Straight copy of https://github.com/manvalls/server-only-context/tree/main
// Inlined for demonstration purposes.
function createContext<T>(defaultValue: T): [() => T, (v: T) => void] {
  const getRef = cache(() => ({ current: defaultValue }));

  const getValue = (): T => getRef().current;

  const setValue = (value: T) => {
    getRef().current = value;
  };

  return [getValue, setValue];
}

export const [getPath, setPath] = createContext('/');
