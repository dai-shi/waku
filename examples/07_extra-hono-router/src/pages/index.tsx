import { Form } from '../components/Form';

export default function HomePage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 p-6">
      <div className="bg-slate-100 rounded-md p-4">
        <Form />
      </div>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
