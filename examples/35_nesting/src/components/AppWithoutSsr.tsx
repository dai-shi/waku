import { CounterWithoutSsr } from './CounterWithoutSsr';

const AppWithoutSsr = () => {
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1>Hello!!</h1>
          <h3>This is a server component without SSR.</h3>
          <CounterWithoutSsr />
        </div>
      </body>
    </html>
  );
};

export default AppWithoutSsr;
