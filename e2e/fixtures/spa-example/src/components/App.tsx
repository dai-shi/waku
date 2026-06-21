import { Counter } from './Counter';

export function App() {
  return (
    <html>
      <head>
        <title>Waku SPA</title>
      </head>
      <body>
        <h1 data-testid="title">Hello Client</h1>
        <Counter />
      </body>
    </html>
  );
}
