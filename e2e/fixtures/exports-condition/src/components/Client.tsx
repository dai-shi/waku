'use client';
import { runtime } from 'my-module';
import { useEffect, useState } from 'react';

export const Client = () => {
  // avoid hydration error, since runtime is different between client/server
  const [mount, setMount] = useState(false);
  useEffect(() => {
    setMount(true);
  }, []);
  if (mount) {
    return <div data-testid="client-runtime">{runtime}</div>;
  }
  return null;
};
