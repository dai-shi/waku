import { Tweet } from 'react-tweet';
import 'react-tweet/theme.css';

const App = ({ id }: { id: string }) => {
  return (
    <div>
      <Tweet id={id} />
    </div>
  );
};

export default App;
