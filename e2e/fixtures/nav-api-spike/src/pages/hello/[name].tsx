import { ParamsProbe } from '../../components/params-probe.js';

export default function HelloPage({ name }: { name: string }) {
  return (
    <div>
      <h1 data-testid="hello">Hello {name}</h1>
      <ParamsProbe />
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
