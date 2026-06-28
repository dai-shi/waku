import { Link } from 'waku';
import type { GuideTag } from '../types';

type GuideItemProps = {
  slug: string;
  title: string;
  description: string;
  tags: GuideTag[];
};

export type GuideSectionProps = {
  category: string;
  guides: GuideItemProps[];
};

export const GuideTags = ({ tags }: { tags: GuideTag[] }) => {
  if (!tags.length) {
    return null;
  }
  return (
    <ul className="mb-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li
          key={tag}
          className="inline-flex w-fit rounded-md border border-secondary/30 px-2 py-1 font-simple text-[0.625rem] font-bold text-secondary sm:text-xs"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
};

const GuideItem = ({ guide }: { guide: GuideItemProps }) => (
  <li>
    <Link
      to={`/guides/${guide.slug}`}
      className="bg-gray-950/90 group flex h-full flex-col rounded-xl border border-gray-800 p-4 transition-colors duration-300 ease-in-out hover:border-secondary sm:p-6"
    >
      <GuideTags tags={guide.tags} />
      <h3 className="font-headline text-xl leading-tight sm:text-2xl">
        {guide.title}
      </h3>
      <p className="mt-2 text-sm font-normal leading-snug text-white/60">
        {guide.description}
      </p>
    </Link>
  </li>
);

export const GuideList = ({ sections }: { sections: GuideSectionProps[] }) => (
  <div className="-mx-4 flex flex-col gap-12 sm:-mx-6 lg:-mx-12">
    {sections.map((section) => (
      <section key={section.category}>
        <h2 className="font-label mb-4 text-sm font-bold text-secondary">
          {section.category}
        </h2>
        <ul className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {section.guides.map((guide) => (
            <GuideItem key={guide.slug} guide={guide} />
          ))}
        </ul>
      </section>
    ))}
  </div>
);
