'use client';

import { Link, useRouter_UNSTABLE } from 'waku';
import TestRouter from '../TestRouter.js';

const Page = () => {
  const router = useRouter_UNSTABLE();
  return (
    <>
      <h1>Dynamic</h1>
      <p>
        <Link to="/static">Go to static</Link>
        <button onClick={() => router.push(`/static`)}>
          Static router.push button
        </button>
      </p>
      <TestRouter />
    </>
  );
};

export default Page;
