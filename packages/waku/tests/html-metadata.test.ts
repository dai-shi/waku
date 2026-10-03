import { injectRSCPayload } from 'rsc-html-stream/server';
import { describe, expect, test } from 'vitest';
import { streamToBytes } from '../src/lib/utils-isomorphic/stream.js';
import {
  type MetadataFilter,
  dedupeHeadMetadataForTest,
  dedupeHtmlMetadataStream,
} from '../src/lib/utils-server/html-metadata.js';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { ignoreBOM: true });

const pipeBytes = async (
  chunks: readonly Uint8Array[],
  maxBufferedHead?: number,
): Promise<string> => {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return dec.decode(
    await streamToBytes(
      input.pipeThrough(dedupeHtmlMetadataStream({}, maxBufferedHead)),
    ),
  );
};

const pipe = (
  chunks: readonly string[],
  maxBufferedHead?: number,
): Promise<string> =>
  pipeBytes(
    chunks.map((chunk) => enc.encode(chunk)),
    maxBufferedHead,
  );

const dedupeClosedHead = (
  head: string,
  filter?: Partial<MetadataFilter>,
): string =>
  dedupeHeadMetadataForTest(head + '</head>', filter).slice(
    0,
    -'</head>'.length,
  );

describe('dedupeClosedHead', () => {
  test('merges nothing in a head it has not read the end of', () => {
    const head = '<title>layout</title><title>page</title>';
    expect(dedupeHeadMetadataForTest(head)).toBe(head);
  });

  test('keeps the last title', () => {
    expect(dedupeClosedHead('<title>layout</title><title>page</title>')).toBe(
      '<title>page</title>',
    );
  });

  test('keeps the last description and og tag', () => {
    const head =
      '<meta name="description" content="layout"/>' +
      '<meta property="og:title" content="layout"/>' +
      '<meta name="description" content="page"/>' +
      '<meta property="og:title" content="page"/>';
    expect(dedupeClosedHead(head)).toBe(
      '<meta name="description" content="page"/>' +
        '<meta property="og:title" content="page"/>',
    );
  });

  test('deduplicates each scalar og property independently', () => {
    const head =
      '<meta property="og:title" content="a"/>' +
      '<meta property="og:site_name" content="b"/>' +
      '<meta property="og:title" content="c"/>';
    expect(dedupeClosedHead(head)).toBe(
      '<meta property="og:site_name" content="b"/>' +
        '<meta property="og:title" content="c"/>',
    );
  });

  test('supersedes with a value, never with the want of one', () => {
    // React leaves `content` out of a `<meta>` whose value is undefined, so
    // the tag declares nothing and must not take the layout's value with it.
    const layout = '<meta name="description" content="layout"/>';
    const page = '<meta name="description" content="page"/>';
    const unset = '<meta name="description"/>';
    expect(dedupeClosedHead(layout + unset)).toBe(layout);
    expect(dedupeClosedHead(unset + page)).toBe(page);
    expect(dedupeClosedHead(unset + unset)).toBe(unset + unset);
    // An empty `content` is a value the page chose, and supersedes.
    const empty = '<meta name="description" content=""/>';
    expect(dedupeClosedHead(layout + empty)).toBe(empty);
  });

  test('supersedes with an empty title, which React renders either way', () => {
    // `<title>{undefined}</title>` and `<title>{''}</title>` both render as
    // `<title></title>`, so an empty one is as much a declaration as any.
    expect(dedupeClosedHead('<title>Layout</title><title></title>')).toBe(
      '<title></title>',
    );
  });

  test('stops at a tag that names itself twice', () => {
    // Removing it would take the second name's value out of the document, and
    // keeping it would shadow whatever supersedes the first. The second name
    // need not be one the filter merges.
    const one = '<meta name="description" content="page"/>';
    for (const second of [
      'property="og:description"',
      'property="og:image"',
      'http-equiv="refresh"',
      'charset="utf-8"',
      'itemprop="x"',
    ]) {
      const pair = `<meta name="description" ${second} content="layout"/>`;
      expect(dedupeClosedHead(pair + one)).toBe(pair + one);
      expect(dedupeClosedHead(one + pair)).toBe(one + pair);
    }
  });

  test('stops at an itemProp tag that shadows a name it merges', () => {
    // `itemProp` takes the tag out of the document's metadata but not out of
    // the document, so it still shadows the title that supersedes it.
    const head =
      '<title>layout</title><title itemProp="name">Item</title>' +
      '<title>page</title>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('keeps repeated og properties that represent arrays', () => {
    const head =
      '<meta property="og:image" content="hero.jpg"/>' +
      '<meta property="og:image:width" content="800"/>' +
      '<meta property="og:image" content="thumb.jpg"/>' +
      '<meta property="og:video" content="a.mp4"/>' +
      '<meta property="og:video" content="b.mp4"/>' +
      '<meta property="og:locale:alternate" content="fr_FR"/>' +
      '<meta property="og:locale:alternate" content="de_DE"/>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('leaves raw text in script and style untouched', () => {
    const head =
      '<title>layout</title>' +
      '<script>const h = "<title>example</title>";</script>' +
      '<style>/* <meta name="description" content="x"> */</style>' +
      '<title>page</title>';
    expect(dedupeClosedHead(head)).toBe(
      '<script>const h = "<title>example</title>";</script>' +
        '<style>/* <meta name="description" content="x"> */</style>' +
        '<title>page</title>',
    );
  });

  test('stops at a script it cannot tell the end of', () => {
    // React escapes `<script` in the children it renders, so a script that
    // reads as double escaped only arrives through `dangerouslySetInnerHTML`.
    for (const nested of ['<script>', '<SCRIPT>']) {
      const script = `<script><!--${nested}</script><title>trap</title>--></script>`;
      const head = `<title>a</title>${script}<title>b</title>`;
      expect(dedupeClosedHead(head)).toBe(head);
    }
  });

  test('reads a script whose content React could have written', () => {
    const script = '<script>const s = "<!-- not a script -->";</script>';
    expect(dedupeClosedHead(`<title>a</title>${script}<title>b</title>`)).toBe(
      `${script}<title>b</title>`,
    );
  });

  test('leaves raw text whose close tag name runs into punctuation', () => {
    const script =
      '<script>const s = "</script!><title>trap</title>";</script>';
    expect(dedupeClosedHead(`<title>a</title>${script}<title>b</title>`)).toBe(
      `${script}<title>b</title>`,
    );
    const style =
      '<style>.a{content:"</style:foo><title>trap</title>"}</style>';
    expect(dedupeClosedHead(`<title>a</title>${style}<title>b</title>`)).toBe(
      `${style}<title>b</title>`,
    );
  });

  test('stops at anything a head of metadata would not hold', () => {
    // A template's contents are a separate fragment, a `noscript`'s depend on
    // whether scripting is on, an svg `<title>` labels a graphic, and a `div`
    // is not head content at all. None of them is the document's metadata.
    for (const wrapper of ['template', 'noscript', 'svg', 'div', 'foo']) {
      const head = `<title>a</title><${wrapper}><title>b</title></${wrapper}>`;
      expect(dedupeClosedHead(head)).toBe(head);
    }
    const noscript =
      '<meta name="description" content="normal"/>' +
      '<noscript><meta name="description" content="fallback"/></noscript>';
    expect(dedupeClosedHead(noscript)).toBe(noscript);
  });

  test('reads the elements a head does hold', () => {
    const head =
      '<base href="/"/><link rel="icon" href="x"/>' +
      '<title>layout</title><title>page</title>';
    expect(dedupeClosedHead(head)).toBe(
      '<base href="/"/><link rel="icon" href="x"/><title>page</title>',
    );
  });

  test('reads a tag name to the end a parser reads it to', () => {
    // A name runs to whitespace, `/` or `>`, so this is `linké`, not `link`
    // with a stray attribute, and it is not an element the scan reads.
    const head = '<title>a</title><link\u00e9><title>b</title>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('stops at a `<` a parser would not read as a tag', () => {
    // A parser reads `<3` as text and `<?x` as a comment, and joins the `<`
    // to what follows it. Only `dangerouslySetInnerHTML` puts either in a head.
    for (const stray of ['<3', '<-x', '<?x ', '</1', '<<meta content="1">']) {
      const head = `<title>a</title>${stray}<title>b</title>`;
      expect(dedupeClosedHead(head)).toBe(head);
    }
  });

  test('stops at a head a parser ends at `</html>`', () => {
    const head = '<title>a</title><title>b</title></html><title>c</title>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('reads the doctype a React document opens with, and no other `<!`', () => {
    // A comment is the only other `<!` a head can hold, and only markup the
    // scan passes through can put one there.
    expect(
      dedupeClosedHead('<!DOCTYPE html><title>a</title><title>b</title>'),
    ).toBe('<!DOCTYPE html><title>b</title>');
    for (const bang of ['<!-- c -->', '<!---->', '<![CDATA[x]]>', '<!']) {
      const head = `<title>a</title>${bang}<title>b</title>`;
      expect(dedupeClosedHead(head)).toBe(head);
    }
  });

  test('stops at text, which a parser ends the head at', () => {
    // What follows the text goes in the body, so the head would lose the tag
    // that superseded the one it held.
    const head =
      '<meta name="description" content="layout"/>x' +
      '<meta name="description" content="page"/>';
    expect(dedupeClosedHead(head)).toBe(head);
    // Whitespace is head content like any other.
    expect(dedupeClosedHead('<title>a</title>\n\t <title>b</title>')).toBe(
      '\n\t <title>b</title>',
    );
  });

  test('stops at a stray close tag of an element it does not read', () => {
    const head = '<title>a</title></div><title>b</title>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('ends raw text at the first close tag, as a parser does', () => {
    // The `</style>` in the declaration ends the element, so the `"}` after
    // it is text, which ends the head. Reading on to the last `</style>`
    // would find no text and merge the titles either side.
    const head =
      '<title>a</title>' +
      '<style>i::after{content:"</style>"}' +
      '<title>trap</title></style>' +
      '<title>b</title>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('matches a filter entry spelled with non-ascii characters', () => {
    const name = 'r\u00e9sum\u00e9';
    expect(
      dedupeClosedHead(
        `<meta name="${name}" content="layout"/>` +
          `<meta name="${name}" content="page"/>`,
        { metaNames: [name], metaProperties: [] },
      ),
    ).toBe(`<meta name="${name}" content="page"/>`);
  });

  test('matches a property exactly as written', () => {
    // RDFa folds a property's prefix but not the rest, so `og:TITLE` is not
    // `og:title`. The scan folds neither part: leaving `OG:title` unmerged
    // is the price of never merging two properties that differ.
    const layout = '<meta property="og:title" content="layout"/>';
    for (const property of ['og:TITLE', 'OG:title']) {
      const page = `<meta property="${property}" content="page"/>`;
      expect(dedupeClosedHead(layout + page)).toBe(layout + page);
    }
    expect(
      dedupeClosedHead(
        '<meta property="OG:Title" content="a"/>' +
          '<meta property="OG:Title" content="b"/>',
        { metaNames: [], metaProperties: ['OG:Title'] },
      ),
    ).toBe('<meta property="OG:Title" content="b"/>');
  });

  test('matches a filter entry whatever case it is written in', () => {
    const head =
      '<meta name="Description" content="a"><meta name="Description" content="b">';
    expect(
      dedupeClosedHead(head, {
        metaNames: ['Description'],
        metaProperties: [],
      }),
    ).toBe('<meta name="Description" content="b">');
  });

  test('deduplicates a title carrying attributes', () => {
    expect(
      dedupeClosedHead('<title>Layout</title><title lang="en">Page</title>'),
    ).toBe('<title lang="en">Page</title>');
  });

  test('leaves an itemProp title alone', () => {
    const head = '<title>Layout</title><title itemProp="name">Item</title>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('matches metadata names case-insensitively', () => {
    expect(
      dedupeClosedHead(
        '<meta name="description" content="layout"/>' +
          '<meta name="Description" content="page"/>',
      ),
    ).toBe('<meta name="Description" content="page"/>');
  });

  test('merges the meta names the filter names', () => {
    const head =
      '<meta name="robots" content="index"/>' +
      '<meta name="robots" content="noindex"/>';
    expect(dedupeClosedHead(head)).toBe(head);
    expect(dedupeClosedHead(head, { metaNames: ['robots'] })).toBe(
      '<meta name="robots" content="noindex"/>',
    );
  });

  test('fills in a filter field left undefined', () => {
    // TypeScript allows one unless exactOptionalPropertyTypes is on, and it is
    // off by default.
    const head =
      '<meta name="description" content="a"/>' +
      '<meta name="description" content="b"/>';
    expect(dedupeClosedHead(head, { metaNames: undefined } as never)).toBe(
      '<meta name="description" content="b"/>',
    );
  });

  test('an empty filter still merges the title', () => {
    expect(
      dedupeClosedHead(
        '<title>a</title><meta name="description" content="x"/>' +
          '<title>b</title><meta name="description" content="y"/>',
        { metaNames: [], metaProperties: [] },
      ),
    ).toBe(
      '<meta name="description" content="x"/>' +
        '<title>b</title><meta name="description" content="y"/>',
    );
  });

  test('leaves tags outside the allowlist untouched', () => {
    const head =
      '<meta charSet="utf-8"/>' +
      '<meta name="viewport" content="width=device-width"/>' +
      '<meta name="generator" content="Waku"/>' +
      '<meta name="viewport" content="width=400"/>' +
      '<meta name="generator" content="App"/>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('matches tag boundaries around escaped angle brackets', () => {
    // React escapes `<`, `>`, `&` and `"` in text and attribute values alike,
    // so a tag ends at the first `>` and title text at the first `<`.
    const head =
      '<head><meta charSet="utf-8"/><title>a &gt; b</title>' +
      '<link rel="stylesheet" href="/a.css"/>' +
      '<title>c &quot;d&quot;</title></head>';
    expect(dedupeClosedHead(head)).toBe(
      '<head><meta charSet="utf-8"/>' +
        '<link rel="stylesheet" href="/a.css"/>' +
        '<title>c &quot;d&quot;</title></head>',
    );
  });

  test('reads a leading `=` as part of an attribute name', () => {
    // A parser reads `=y` as an attribute name, so `Name` is this tag's
    // `name` and the later `NAME` a duplicate it ignores. Reading `=` as an
    // empty name instead would swallow `y//Name` as a value and leave the
    // tag matching the filter it does not match.
    const head =
      '<meta name="description" content="first"/>' +
      '<meta//=y//Name = descriptionx NAME =Description content="second"/>';
    expect(dedupeClosedHead(head)).toBe(head);
  });

  test('ends a tag at a `>` outside its attribute values', () => {
    expect(
      dedupeClosedHead(
        '<meta name="description" content="a>b"/>' +
          '<meta name="description" content="c"/>',
      ),
    ).toBe('<meta name="description" content="c"/>');
  });

  test('returns the input unchanged when there is nothing to remove', () => {
    const head = '<title>only</title><meta name="description" content="one"/>';
    expect(dedupeClosedHead(head)).toBe(head);
  });
});

describe('dedupeHtmlMetadataStream', () => {
  test('rewrites the head and passes the body through', async () => {
    const html =
      '<!DOCTYPE html><html><head><title>layout</title>' +
      '<title>page</title></head><body><title>body</title></body></html>';
    expect(await pipe([html])).toBe(
      '<!DOCTYPE html><html><head><title>page</title></head>' +
        '<body><title>body</title></body></html>',
    );
  });

  test('handles a head split across chunks', async () => {
    const chunks = [
      '<html><head><title>lay',
      'out</title><title>pa',
      'ge</title></he',
      'ad><body>hi</body></html>',
    ];
    expect(await pipe(chunks)).toBe(
      '<html><head><title>page</title></head><body>hi</body></html>',
    );
  });

  test('handles the closing tag split across a chunk boundary', async () => {
    expect(
      await pipe([
        '<html><head><title>a</title><title>b</title></',
        'head><body/></html>',
      ]),
    ).toBe('<html><head><title>b</title></head><body/></html>');
  });

  test('does not end the head at a `</head>` inside a script', async () => {
    const html =
      '<html><head><title>layout</title>' +
      '<script>const s = "</head>";</script>' +
      '<title>page</title></head><body>hi</body></html>';
    expect(await pipe([html])).toBe(
      '<html><head><script>const s = "</head>";</script>' +
        '<title>page</title></head><body>hi</body></html>',
    );
  });

  test('merges a head the RSC payload is injected into', async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const html = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(enc.encode('<html><head><title>layout</title>'));
        // injectRSCPayload writes the payload after the tick it first sees
        // html in, which need not be the tick that closes the head.
        await tick();
        await tick();
        controller.enqueue(
          enc.encode('<title>page</title></head><body>hi</body></html>'),
        );
        controller.close();
      },
    });
    const rsc = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('["</head> <title>trap</title>"]'));
        controller.close();
      },
    });
    const out = html
      .pipeThrough(injectRSCPayload(rsc, {}))
      .pipeThrough(dedupeHtmlMetadataStream());
    const reader = out.getReader();
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text += dec.decode(value, { stream: true });
    }
    expect(text.indexOf('<script>')).toBeLessThan(text.indexOf('</head>'));
    expect(text).toContain('__FLIGHT_DATA');
    expect(text).not.toContain('<title>layout</title>');
    expect(text).toContain('<title>page</title></head>');
  });

  test('finds the head when every byte arrives in its own chunk', async () => {
    const html =
      '<html><head><title>layout</title><title>page</title></head>' +
      '<body>hi</body></html>';
    const bytes = enc.encode(html);
    const chunks = Array.from(bytes, (_, i) => bytes.subarray(i, i + 1));
    expect(await pipeBytes(chunks)).toBe(
      '<html><head><title>page</title></head><body>hi</body></html>',
    );
  });

  test('merges nothing in a head it gave up on part way through', async () => {
    // The `<div>` would have stopped the scan and merged nothing, but it
    // arrives past the cap, so the head is emitted as it was rendered.
    const opening =
      `<html><head><title>a</title><link rel="preload" href="/${'y'.repeat(64)}"/>` +
      '<title>b</title>';
    const rest = '<div>x</div></head><body>hi</body></html>';
    expect(await pipe([opening, rest], 32)).toBe(opening + rest);
  });

  test('gives up rather than buffer an unfinished head past the cap', async () => {
    // Injected RSC scripts count toward the cap as well, so a head that has
    // not closed by then is emitted as it was rendered.
    const link = `<link rel="preload" href="/${'y'.repeat(64)}"/>`;
    const opening = `<html><head><title>a</title>${link}`;
    const rest = '<title>b</title></head><body>hi</body></html>';
    expect(await pipe([opening, rest], 32)).toBe(opening + rest);
    expect(await pipe([opening, rest])).toBe(
      `<html><head>${link}<title>b</title></head><body>hi</body></html>`,
    );
  });

  test('passes through a document with no head', async () => {
    const html = '<html><body></body></html>';
    expect(await pipe([html])).toBe(html);
  });

  test('keeps a character split by the chunk that closes the head', async () => {
    const bytes = enc.encode(
      '<html><head><title>a</title><title>b</title></head>' +
        '<body>\u65e5\u672c</body></html>',
    );
    // two of the three bytes of the first body character
    const cut = bytes.indexOf(0xe6) + 2;
    expect(await pipeBytes([bytes.subarray(0, cut), bytes.subarray(cut)])).toBe(
      '<html><head><title>b</title></head><body>\u65e5\u672c</body></html>',
    );
  });

  test('does not shift the buffer on a byte it cannot decode', async () => {
    const bytes = new Uint8Array([
      ...enc.encode('<html><head><title>a'),
      0xff,
      ...enc.encode('</title><title>b</title></head><body>xy</body></html>'),
    ]);
    expect(await pipeBytes([bytes])).toBe(
      '<html><head><title>b</title></head><body>xy</body></html>',
    );
  });

  test('passes a byte order mark through untouched', async () => {
    // The scan reads the mark as text and stops, so the bytes go out as they
    // came in rather than decoded and encoded again.
    const html =
      '\uFEFF<html><head><title>a</title><title>b</title></head>' +
      '<body>hi</body></html>';
    expect(await pipe([html])).toBe(html);
  });

  test('stops at text a chunk ends in', async () => {
    const opening = '<html><head><title>a</title>x';
    const rest = '<title>b</title></head><body/></html>';
    expect(await pipe([opening, rest])).toBe(opening + rest);
  });

  test('drops a tag whose attribute holds a split character', async () => {
    // The dropped tag's offsets are byte offsets, so a chunk boundary inside
    // the utf-8 sequence of an attribute value must not shift them.
    const bytes = enc.encode(
      '<html><head><meta name="description" content="\u65e5\u672c\u8a9e"/>' +
        '<meta name="description" content="page"/></head><body/></html>',
    );
    // one of the three bytes of the first character of the dropped tag
    const cut = bytes.indexOf(0xe6) + 1;
    expect(await pipeBytes([bytes.subarray(0, cut), bytes.subarray(cut)])).toBe(
      '<html><head><meta name="description" content="page"/></head>' +
        '<body/></html>',
    );
  });

  test('does not split multi-byte characters across chunks', async () => {
    const html =
      '<html><head><title>あ</title><title>日本語</title></head><body/></html>';
    const bytes = enc.encode(html);
    const chunks: Uint8Array[] = [];
    // 7-byte slices land inside the multi-byte sequences.
    for (let i = 0; i < bytes.length; i += 7) {
      chunks.push(bytes.subarray(i, i + 7));
    }
    expect(await pipeBytes(chunks)).toBe(
      '<html><head><title>日本語</title></head><body/></html>',
    );
  });
});
