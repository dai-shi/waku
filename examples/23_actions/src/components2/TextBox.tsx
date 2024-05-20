import { useEffect, useState } from 'react';

import { greet } from './funcs2';

export const TextBox = () => {
  const [text, setText] = useState('hello');
  useEffect(() => {
    greet('TextBox').then((res) => {
      console.log('Response from greet:', res);
    });
  }, []);
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <span>{text.toUpperCase()}</span>
    </div>
  );
};
