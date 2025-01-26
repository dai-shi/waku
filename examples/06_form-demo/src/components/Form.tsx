'use client';

import { useFormStatus } from 'react-dom';

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        disabled={pending}
        type="submit"
        className="hover:bg-slate-50 w-fit rounded-lg bg-white p-2"
      >
        {pending ? 'Pending...' : 'Submit'}
      </button>
    </>
  );
};

export const Form = ({
  message,
  greet,
}: {
  message: Promise<string>;
  greet: (formData: FormData) => Promise<void>;
}) => (
  <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
    <p>{message}</p>
    <form action={greet}>
      <div className="flex flex-col gap-1 text-left">
        <div>
          Name:{' '}
          <input
            name="name"
            required
            className="invalid:border-red-500 rounded-sm border px-2 py-1"
          />
        </div>
        <div>
          Email:{' '}
          <input
            type="email"
            name="email"
            required
            className="invalid:border-red-500 rounded-sm border px-2 py-1"
          />
        </div>
        <SubmitButton />
      </div>
    </form>
    <h3>This is a client component.</h3>
  </div>
);
