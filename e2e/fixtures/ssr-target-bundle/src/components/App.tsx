import { Textarea } from './Textarea.js';

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku example</title>
      <h1 data-testid="app-name">{name}</h1>
      <Textarea />
    </div>
  );
};

export default App;
