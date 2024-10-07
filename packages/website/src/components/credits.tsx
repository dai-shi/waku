export const Credits = () => {
  if (import.meta.env.WAKU_PUBLIC_SHOW_CREDITS !== 'YES') {
    return null;
  }

  return (
    <>
      <div className="pointer-events-none fixed bottom-0 right-0 z-100 origin-bottom-right scale-75 bg-transparent bg-[url('https://storage.googleapis.com/candycode/bg.png')] bg-[length:100%_100%] bg-no-repeat pl-[256px] pt-[96px] leading-none sm:scale-100">
        <a
          href="https://candycode.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="group pointer-events-auto relative inline-flex w-full flex-col items-center justify-center gap-[4px] p-[16px]"
        >
          <span className="whitespace-nowrap font-simple text-[11px] uppercase tracking-[0.125em] text-gray-500 transition-colors duration-300 ease-in-out group-hover:text-white">
            designed by
          </span>
          <img
            src="https://storage.googleapis.com/candycode/candycode.svg"
            alt="candycode alternative graphic design web development agency San Diego"
            className="h-[20px] w-[104px]"
          />
        </a>
      </div>
    </>
  );
};
