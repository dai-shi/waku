'use client';

import { useEffect, useState } from 'react';
import { Echo } from './Echo.js';

export function ClientEcho({ echo }: { echo: string }) {
  const [timeStamp, setTimestamp] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setTimestamp(Date.now()), 1000);
    return () => clearInterval(interval);
  });
  return <Echo echo={echo} timestamp={timeStamp} />;
}
