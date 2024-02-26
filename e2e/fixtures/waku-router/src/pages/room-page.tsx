import { Link } from 'waku/router/client';

type RoomPageProps = {
  roomId: string;
};

export const RoomPage = (props: RoomPageProps) => {
  const { roomId: currentRoomId } = props;
  return (
    <div>
      <div>
        This is the room page for room ID:{' '}
        <span data-testid="current-room-id">{currentRoomId}</span>
      </div>
      <div>
        <Link to="/" data-testid="link-to-home">
          Link /home
        </Link>
      </div>
      <div>
        <a href="/" data-testid="a-to-home">
          a /home
        </a>
      </div>
    </div>
  );
};
