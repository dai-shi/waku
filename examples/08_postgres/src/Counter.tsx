"use client";

import { useState, Suspense } from "react";
import { UsersList } from "./Users.js";

export const Counter = () => {
  const [count, setCount] = useState(0);
  const [userKeyword, setUserKeyword] = useState('');

  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
      <input type="text" value={userKeyword} onChange={e => setUserKeyword(e.target.value)}/>

      <Suspense fallback={<div>Loading...</div>}>
        {  /* @ts-ignore */ }
        <UsersList searchText={userKeyword} />
      </Suspense>
    </div>
  );
};
