import { Counter } from './Counter';
import { Form } from './Form';
import { ServerForm } from './ServerForm';
import { getMessage, greet, increment } from './funcs';

const App = ({ name }: { name: string }) => {
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1>Hello {name}!!</h1>
          <h3>This is a server component.</h3>
          <Form message={getMessage()} greet={greet} />
          <Counter increment={increment} />
          <ServerForm />
        </div>
      </body>
    </html>
  );
};

export default App;
