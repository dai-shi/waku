export const AllSponsors = () => {
  return (
    <ul className="mt-8 flex flex-col flex-wrap gap-6 sm:mt-4 sm:flex-row sm:gap-12">
      {allSponsors.map((sponsor) => (
        <li key={sponsor.title} className="w-auto">
          <a
            href={sponsor.url}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            <img
              src={sponsor.logo}
              alt={sponsor.title}
              className="block h-8 w-auto object-contain object-center"
            />
          </a>
        </li>
      ))}
    </ul>
  );
};

const allSponsors = [
  {
    title: 'Vercel',
    logo: 'https://cdn.candycode.com/waku/vercel.svg',
    url: 'https://vercel.com/home',
  },
  {
    title: 'Progress KendoReact',
    logo: 'https://cdn.candycode.com/waku/sponsors/kendo-react.png',
    url: 'https://www.telerik.com/kendo-react-ui',
  },
];
