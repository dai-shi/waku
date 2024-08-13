export const StockSkeleton = () => {
  return (
    <div className="bg-zinc-950 text-green-400 border-zinc-900 rounded-xl border p-4">
      <div className="bg-zinc-700 float-right inline-block w-fit rounded-full bg-white/10 px-2 py-1 text-xs text-transparent">
        xxxxxxx
      </div>
      <div className="bg-zinc-700 mb-1 w-fit rounded-md text-lg text-transparent">
        xxxx
      </div>
      <div className="bg-zinc-700 w-fit rounded-md text-3xl font-bold text-transparent">
        xxxx
      </div>
      <div className="text bg-zinc-700 mt-1 w-fit rounded-md text-xs text-transparent">
        xxxxxx xxx xx xxxx xx xxx
      </div>

      <div className="relative -mx-4 cursor-col-resize">
        <div style={{ height: 146 }}></div>
      </div>
    </div>
  );
};
