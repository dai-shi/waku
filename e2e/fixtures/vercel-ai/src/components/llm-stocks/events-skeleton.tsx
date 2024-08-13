export const EventsSkeleton = () => {
  return (
    <div className="-mt-2 flex flex-col gap-2 overflow-scroll py-4 sm:flex-row">
      <div className="bg-zinc-900 flex max-w-96 flex-shrink-0 flex-col rounded-lg p-4">
        <div className="bg-zinc-700 mb-1 w-fit rounded-md text-sm text-transparent">
          {'xxxxx'}
        </div>
        <div className="bg-zinc-700 mb-1 w-fit rounded-md text-transparent">
          {'xxxxxxxxxxx'}
        </div>
        <div className="bg-zinc-700 h-[42px] w-auto rounded-md text-transparent sm:w-[352px]"></div>
      </div>
    </div>
  );
};
