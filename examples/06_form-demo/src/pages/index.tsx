import { Form } from '../components/Form';
import { getMessage, greet } from '../components/funcs';
import { ServerForm } from '../components/ServerForm';

export default function HomePage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 p-6">
      <div className="bg-slate-100 rounded-md p-4">
        <h2 className="text-2xl">Server Form</h2>
        <ServerForm />
      </div>
      <div className="bg-slate-100 rounded-md p-4">
        <h2 className="text-2xl">Client Form</h2>
        <Form message={getMessage()} greet={greet} />
      </div>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
