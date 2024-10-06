import { useEffect, useState } from 'react';

import { greet, hello } from './funcs2';

export const TextBox = () => {
  const [text, setText] = useState('react');
  const helloWitText = hello.bind(null, text);
  useEffect(() => {
    greet('TextBox').then((res) => {
      console.log('Response from greet:', res);
    });
  }, []);
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <span>{text.toUpperCase()}</span>
      <button onClick={() => helloWitText()}>Hello to the server</button>
    </div>
  );
};
