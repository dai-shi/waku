'use client';
import TextareaAutosize from 'react-textarea-autosize';

export const Textarea = () => {
  return (
    <div>
      <TextareaAutosize data-testid="textarea" defaultValue={'EMPTY'} />
    </div>
  );
};
