export const Footer = () => {
  return (
    <nav className="px-8 py-4 flex gap-4 flex-row justify-between items-center text-sm">
      <div>
        <h1>a library by daishi kato</h1>
      </div>

      <div>
        <h1>Copyright 2023</h1>
      </div>

      {/* pages */}
      <div className="flex flex-row gap-4 items-center">
        <h1>repositories</h1>
      </div>
    </nav>
  );
};
