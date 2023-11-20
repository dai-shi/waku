import { Counter } from './Counter.js';
import './App.css';
import { container } from './styles.css.js';
console.log(container, import.meta.env.VITE_RSC_BUILD);

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <h1>Hello {name}!!</h1>
      <h3 className={container}>This is a server component.</h3>
      <Counter />
    </div>
  );
};

export default App;
