import { Link } from 'waku';
import TestRouter from '../TestRouter.js';

const Page = () => (
  <>
    <h1>Static</h1>
    <p>
      <Link to="/dynamic">Go to dynamic</Link>
    </p>
    <TestRouter />
  </>
);

export const getConfig = async () => {
  return {
    render: 'static',
  };
};

export default Page;
