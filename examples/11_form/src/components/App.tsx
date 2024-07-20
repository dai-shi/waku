import { Counter } from './Counter';
import { Form } from './Form';
import { ServerForm } from './ServerForm';
import { getMessage, greet, increment } from './funcs';

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Counter increment={increment} />
      <Form message={getMessage()} greet={greet} />
      <ServerForm />
    </div>
  );
};

export default App;
