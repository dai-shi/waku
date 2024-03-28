import { Counter } from './Counter';
import { Form } from './Form';
import { getMessage, greet, increment } from './funcs';

type ServerFunction<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Promise<R>
  : never;

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Counter
        increment={increment as unknown as ServerFunction<typeof increment>}
      />
      <Form
        message={getMessage()}
        greet={greet as unknown as ServerFunction<typeof greet>}
      />
    </div>
  );
};

export default App;
