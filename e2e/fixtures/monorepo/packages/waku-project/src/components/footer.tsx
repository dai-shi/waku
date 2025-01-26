export const Footer = () => {
  return (
    <footer style={{ bottom: 0, left: 0, position: 'fixed', padding: 16 }}>
      <div>
        visit{' '}
        <a
          href="https://waku.gg/"
          target="_blank"
          rel="noreferrer"
          style={{
            marginTop: 16,
            display: 'inline-block',
            textDecoration: 'underline',
          }}
        >
          waku.gg
        </a>{' '}
        to learn more
      </div>
    </footer>
  );
};
