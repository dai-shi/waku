import { Link } from 'waku';

export const HomePage = async () => {
  const randomRoomId = crypto.randomUUID();
  return (
    <ul>
      <Link data-testid="link-to-room" to={`/${randomRoomId}`}>
        <li>Link /{randomRoomId}</li>
      </Link>
      <li>
        <a data-testid="a-to-room" href={`/${randomRoomId}`}>
          a /{randomRoomId}
        </a>
      </li>
      <Link data-testid="link-to-about" to="/about">
        <li>Link /about</li>
      </Link>
      <li>
        <a data-testid="a-to-about" href="/about">
          a /about
        </a>
      </li>
    </ul>
  );
};
