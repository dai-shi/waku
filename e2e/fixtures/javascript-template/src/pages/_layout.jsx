import { Header } from '../components/header';

export default function Layout({ children }) {
  return (
    <html>
      <head>
        <title>Waku JS fixture</title>
      </head>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}

export const getConfig = () => ({ render: 'static' });
