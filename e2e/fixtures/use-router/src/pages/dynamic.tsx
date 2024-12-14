import { Link } from 'waku';
import TestRouter from '../TestRouter.js';

import { MyButton } from '../components/my-button.js';

const Page = () => (
  <>
    <h1>Dynamic</h1>
    <p>
      <Link to="/static">Go to static</Link>
      <MyButton />
    </p>
    <TestRouter />
  </>
);

export default Page;
