import type { PropsWithChildren } from 'react';
import { setPath } from '../context.js';

export default function Layout({
  children,
  path,
}: PropsWithChildren<{ path: string }>) {
  setPath(path);
  return children;
}
