export const Credits = () => {
  if (import.meta.env.WAKU_PUBLIC_SHOW_CREDITS !== 'YES') {
    return null;
  }

  return (
    <>
      <div className="scale-60 bg-size-[100%_100%] pointer-events-none fixed bottom-0 right-0 z-100 origin-bottom-right bg-transparent bg-[url('https://storage.googleapis.com/candycode/bg.png')] bg-no-repeat pl-64 pt-24 leading-none sm:scale-100">
        <a
          href="https://candycode.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="group pointer-events-auto relative inline-flex w-full flex-col items-center justify-center gap-1 p-4"
        >
          <span className="whitespace-nowrap font-simple text-[11px] uppercase tracking-[0.125em] text-gray-500 transition-colors duration-300 ease-in-out group-hover:text-white">
            designed by
          </span>
          <img
            src="https://storage.googleapis.com/candycode/candycode.svg"
            alt="candycode alternative graphic design web development agency San Diego"
            className="w-26 h-5"
          />
        </a>
      </div>
    </>
  );
};
