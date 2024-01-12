import { useState } from 'react';

export const TextBox = () => {
  const [text, setText] = useState('hello');
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <span>{text.toUpperCase()}</span>
    </div>
  );
};
