'use client';

export const Reload = () => {
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <button
      onClick={handleReload}
      className="inline-flex aspect-square size-16 items-center justify-center rounded-full bg-black"
    >
      <span className="text-sm font-bold text-white">reload</span>
    </button>
  );
};
