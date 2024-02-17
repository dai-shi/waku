import { Textarea } from './Textarea.js';
import SampleImage from './image-not-inlined.jpg'; // build.assetsInlineLimit - default 4096 Bytes

const App =  ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku example</title>
      <h1 data-testid="app-name">{name}</h1>
      <Textarea />
      <img data-testid="image" src={SampleImage} alt="sample" />
    </div>
  );
};

export default App;
