import { Counter } from './Counter';

const App = ({ name }: { name: string }) => {
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div
          style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}
        >
          <h1>Hello {name}!!</h1>
          <h3>This is a client component.</h3>
          <Counter />
          <div>{new Date().toISOString()}</div>
        </div>
      </body>
    </html>
  );
};

export default App;
