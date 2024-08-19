import { getEnv } from 'waku';
import { Counter } from '@/components/Counter';
import { MyFragment } from '@/components/MyFragment';

console.log('FOO', getEnv('FOO'));

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
          <MyFragment>
            <h1>Hello {name}!!</h1>
          </MyFragment>
          <h3>This is a server component.</h3>
          <Counter />
          <div>{new Date().toISOString()}</div>
        </div>
      </body>
    </html>
  );
};

export default App;
