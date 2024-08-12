import { Textarea } from './Textarea.js';
import SampleImage from './image-not-inlined.jpg'; // build.assetsInlineLimit - default 4096 Bytes
import SampleJsonPrivate from './json-private-not-inlined.json'; // build.assetsInlineLimit - default 4096 Bytes
import SampleJsonPublic from './json-public-linked-not-inlined.json?url'; // build.assetsInlineLimit - default 4096 Bytes

const App = async ({ name }: { name: string }) => {
  const data = await getData();
  return (
    <html>
      <head>
        <title>Waku example</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1 data-testid="app-name">{name}</h1>
          <Textarea />
          <img data-testid="image" src={SampleImage} alt="sample" />
          <p data-testid="json-private">{data.lengthOfPassword}</p>
          <a data-testid="json-public-linked" href={SampleJsonPublic}>
            Public JSON
          </a>
        </div>
      </body>
    </html>
  );
};

const getData = async () => {
  const data = {
    lengthOfPassword: SampleJsonPrivate.password.length,
    type: SampleJsonPrivate.type,
  };
  return data;
};

export default App;
