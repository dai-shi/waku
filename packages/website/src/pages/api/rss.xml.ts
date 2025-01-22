import { compileMDX } from 'next-mdx-remote/rsc';
import { readdirSync, readFileSync } from 'node:fs';

type Item = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
};

const generateRSSFeed = (items: Item[]) => {
  const itemsXML = items
    .map(
      (item) => `
   <item>
     <title>${item.title}</title>
     <link>${item.link}</link>
     <pubDate>${item.pubDate}</pubDate>
     <description>${item.description}</description>
     <guid isPermaLink="true">${item.link}</guid>
   </item>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
 <channel>
   <atom:link href="https://waku.gg/api/rss.xml" rel="self" type="application/rss+xml" />
   <title>Waku</title>
   <link>https://waku.gg</link>
   <description>The minimal React framework</description>
   ${itemsXML}
 </channel>
</rss>`;
};

export const GET = async () => {
  const blogFileNames: Array<string> = [];
  readdirSync('./private/contents').forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      blogFileNames.push(fileName);
    }
  });

  const items: Item[] = [];

  for await (const fileName of blogFileNames) {
    const path = `./private/contents/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });

    const frontmatter = mdx.frontmatter as {
      title: string;
      description: string;
      slug: string;
      date: string;
    };
    const [year, month, day] = frontmatter.date.split('/').map(Number) as [
      number,
      number,
      number,
    ];
    items.push({
      title: frontmatter.title,
      link: `https://waku.gg/blog/${frontmatter.slug}`,
      description: frontmatter.description || '',
      pubDate: new Date(Date.UTC(year, month - 1, day)).toUTCString(),
    });
  }

  const rssFeed = generateRSSFeed(items);
  return new Response(rssFeed, {
    headers: {
      'Content-Type': 'application/rss+xml',
    },
  });
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
