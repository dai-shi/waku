export const StocksSkeleton = () => {
  return (
    <div className="mb-4 flex flex-col gap-2 overflow-y-scroll pb-4 text-sm sm:flex-row">
      <div className="bg-zinc-900 hover:bg-zinc-800 flex h-[60px] w-full cursor-pointer flex-row gap-2 rounded-lg p-2 text-left sm:w-[208px]"></div>
      <div className="bg-zinc-900 hover:bg-zinc-800 flex h-[60px] w-full cursor-pointer flex-row gap-2 rounded-lg p-2 text-left sm:w-[208px]"></div>
      <div className="bg-zinc-900 hover:bg-zinc-800 flex h-[60px] w-full cursor-pointer flex-row gap-2 rounded-lg p-2 text-left sm:w-[208px]"></div>
    </div>
  );
};
