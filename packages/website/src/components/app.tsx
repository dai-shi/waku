import { Button } from './button.js';
import { Content } from './content.js';
import { Credits } from './credits.js';
import { Readme } from './readme.js';

const App = () => {
  return (
    <div className="relative flex h-[100svh] w-full flex-col items-center justify-center overflow-clip font-sans">
      <div className="absolute inset-0 z-0 sm:-inset-8">
        <img
          src="https://cdn.candycode.com/waku/background.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 z-10 h-full w-full bg-gradient-radial from-transparent to-black/25" />
      <div className="relative z-20 pt-8 text-center text-white">
        <h1
          className="-ml-4 font-serif text-8xl font-extrabold leading-none sm:text-[10rem]"
          style={{ textShadow: '0.375rem 0.375rem 0px black' }}
        >
          Waku
        </h1>
        <h3
          className="text-xl font-bold leading-none text-white/80 sm:-mt-2 sm:text-3xl"
          style={{ textShadow: '0.075rem 0.075rem 0px black' }}
        >
          The minimal React framework
        </h3>
        <div className="mt-12 flex flex-col justify-center gap-4 px-12 sm:mt-8 sm:flex-row sm:gap-6 sm:px-0">
          <Readme>
            <Content />
          </Readme>
          {links.map((link) => (
            <Button key={link.href} {...link} />
          ))}
        </div>
      </div>
      <Credits />
    </div>
  );
};

const links = [
  { href: 'https://github.com/dai-shi/waku', children: 'GitHub' },
  // { href: 'https://www.npmjs.com/package/waku', children: 'NPM' },
  { href: 'https://discord.gg/MrQdmzd', children: 'Discord' },
];

export default App;
