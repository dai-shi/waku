import { Link } from 'waku';
import TestRouter from '../TestRouter.js';

const Page = () => (
  <>
    <h1>Dynamic</h1>
    <p>
      <Link to="/static">Go to static</Link>
    </p>
    <TestRouter />
  </>
);

export default Page;
