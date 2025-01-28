'use client';

import { useActionState, useCallback, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { client } from '../rpc-client';

const SubmitButton = () => {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="hover:bg-slate-50 w-fit rounded-lg border border-gray-200 bg-white p-2 transition-colors duration-200 disabled:opacity-50"
      disabled={pending}
    >
      {pending ? 'Saving...' : 'Save Name'}
    </button>
  );
};

const GetNameButton = ({
  isLoading,
  onClick,
}: {
  isLoading: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-slate-50 w-fit rounded-lg border border-gray-200 bg-white p-2 transition-colors duration-200 disabled:opacity-50"
      disabled={isLoading}
    >
      {isLoading ? 'Loading...' : 'Get Name'}
    </button>
  );
};

export const NameForm = () => {
  const [isGetting, setIsGetting] = useState(false);
  const [name, setName] = useState<string>();

  const formAction = async (prevState: any, formData: FormData) => {
    try {
      const name = formData.get('name');
      const response = await client.api.hono.hello.$post({
        json: { name },
      });
      const data = await response.json();
      setName(data.message);
      return { message: data.message, error: null };
    } catch {
      setName('Failed to save name');
      return { message: null, error: 'Failed to save name' };
    }
  };

  const [_, action] = useActionState(formAction, {
    message: 'form action',
    error: null,
  });

  const handleGetName = useCallback(async () => {
    setIsGetting(true);
    try {
      const response = await client.api.hono.hello.$get();
      const data = await response.json();
      setName(data.message);
    } catch {
      setName('Failed to get name');
    } finally {
      setIsGetting(false);
    }
  }, []);

  return (
    <>
      <div className="mx-auto flex max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-md">
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              required
              className="focus:ring-blue-500 focus:border-blue-500 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2"
            />
          </div>

          <div className="flex gap-4">
            <SubmitButton />
            <GetNameButton isLoading={isGetting} onClick={handleGetName} />
          </div>
        </form>
      </div>
      {name && (
        <div className="bg-green-100 text-green-800 rounded-lg p-4">{name}</div>
      )}
    </>
  );
};

export function Form() {
  return (
    <div className="relative bg-gray-50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-8 text-center text-3xl font-bold">Name Manager</h1>
          <NameForm />
        </div>
      </div>
    </div>
  );
}
