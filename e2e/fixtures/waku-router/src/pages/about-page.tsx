import { Link } from 'waku';

export const AboutPage = async () => {
  return (
    <div>
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
