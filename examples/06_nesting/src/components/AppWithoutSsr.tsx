import { CounterWithoutSsr } from './CounterWithoutSsr';

const AppWithoutSsr = () => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <h1>Hello!!</h1>
      <h3>This is a server component without SSR.</h3>
      <CounterWithoutSsr />
    </div>
  );
};

export default AppWithoutSsr;
