export const Nav = () => {
  return (
    <nav className="px-8 py-4 flex gap-4 flex-row justify-between items-center">
      {/* logo */}
      <div>
        <h1>Waku</h1>
      </div>

      {/* pages */}
      <div className="flex flex-row gap-4 items-center">
        <h1>Home</h1>
        <h1>Docs</h1>
      </div>
    </nav>
  );
};
