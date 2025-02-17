import { useState } from 'react';
import { getServerTime } from './server-fns';

export const ServerTime = () => {
  const [serverTime, setServerTime] = useState<string | null>(null);

  return (
    <div>
      <p>Server Time: {serverTime}</p>
      <button
        onClick={async () => {
          setServerTime(null);
          const serverTime = await getServerTime();
          setServerTime(serverTime);
        }}
      >
        Get Server Time
      </button>
    </div>
  );
};
