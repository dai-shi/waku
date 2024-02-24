export const Footer = () => {
  return (
    <footer className="fixed bottom-0 left-0 p-6">
      <div className="font-nunito flex items-center justify-center gap-2 text-lg">
        <span>
          Built by{' '}
          <a
            href="https://www.llamaindex.ai/"
            target="_blank"
            rel="noreferrer"
            className="inline-block underline"
          >
            LlamaIndex
          </a>
        </span>
        and
        <a
          href="https://waku.gg/"
          target="_blank"
          rel="noreferrer"
          className="inline-block underline"
        >
          waku.gg
        </a>
      </div>
    </footer>
  );
};
