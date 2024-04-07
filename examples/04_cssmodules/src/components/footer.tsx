import styles from './footer.module.css';

export const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div>
        visit{' '}
        <a
          href="https://waku.gg/"
          target="_blank"
          rel="noreferrer"
          className={styles.a}
        >
          waku.gg
        </a>{' '}
        to learn more
      </div>
    </footer>
  );
};
