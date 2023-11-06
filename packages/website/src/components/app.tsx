import { Credits } from "./credits.js";

const App = () => {
  return (
    <div className="relative flex h-[100svh] w-full flex-col items-center justify-center overflow-clip font-sans">
      <div className="absolute inset-0 z-0">
        <img
          src="https://cdn.candycode.com/waku/background.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 z-10 h-full w-full bg-gradient-radial from-transparent to-black/25" />
      <div className="relative z-20 pt-8 text-center text-white">
        <h1
          className="-ml-4 font-serif text-9xl font-extrabold leading-none"
          style={{ textShadow: "0.375rem 0.375rem 0px black" }}
        >
          Waku
        </h1>
        <h3
          className="-mt-2 text-2xl font-semibold leading-none opacity-80"
          style={{ textShadow: "0.0625rem 0.0625rem 0px black" }}
        >
          The minimal React framework
        </h3>
        <div className="mt-8 flex justify-center gap-4">
          {links.map((link) => (
            <Link key={link.href} {...link} />
          ))}
        </div>
      </div>
      <Credits />
    </div>
  );
};

const Link = ({ href, children }: any) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopenner noreferrer"
      className="box-content rounded-sm border-b-4 border-red-950 bg-red-900 px-3 py-2 text-sm font-black uppercase leading-none tracking-wide text-red-50"
    >
      {children}
    </a>
  );
};

const links = [
  { href: "https://github.com/dai-shi/waku", children: "GitHub" },
  { href: "https://www.npmjs.com/package/waku", children: "NPM" },
  { href: "https://discord.gg/MrQdmzd", children: "Discord" },
];

export default App;
