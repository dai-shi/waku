export const Footer = () => {
  return (
    <nav className="px-6 md:px-16 py-3 flex gap-4 flex-col md:flex-row justify-between items-center text-sm bg-cCarmine text-cVanilla">
      <div>
        <h1>
          a library by{" "}
          <a
            className="underline underline-offset-4"
            href="https://github.com/dai-shi/"
          >
            daishi kato
          </a>
        </h1>
      </div>
      <div>
        <h1>Copyright © 2023</h1>
      </div>
      {/* pages */}
      <div className="flex flex-row gap-4 items-center">
        <a
          className="underline underline-offset-4"
          href="https://github.com/dai-shi/waku#diagrams"
        >
          architecture
        </a>
        <a
          className="underline underline-offset-4"
          href="https://github.com/dai-shi/waku"
        >
          repository
        </a>
      </div>
    </nav>
  );
};
