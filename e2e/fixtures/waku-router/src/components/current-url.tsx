'use client';
import { useLocation } from 'waku/router/client';

export const CurrentUrl = () => {
  const { path } = useLocation();
  return (
    <div>
      Current URL: <span data-testid="current-url">{path}</span>
    </div>
  );
};
