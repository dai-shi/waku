import { Link } from 'waku';
import { PushProbe } from '../components/PushProbe';

export default function Index() {
  return (
    <div>
      <h1>Index</h1>
      <PushProbe />
      <p>
        <Link to="/exists">Existing page</Link>
      </p>
      <p>
        <Link to={'/broken' as never}>Broken link</Link>
      </p>
      <p>
        <Link to={'/redirect' as never}>Correct redirect</Link>
      </p>
      <p>
        <Link to={'/broken-redirect' as never}>Broken redirect</Link>
      </p>
      <p>
        <Link to="/dynamic-not-found/sync">Dynamic not found sync</Link>
      </p>
      <p>
        <Link to="/dynamic-not-found/async">Dynamic not found async</Link>
      </p>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
