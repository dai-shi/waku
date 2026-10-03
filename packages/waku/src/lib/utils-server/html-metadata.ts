import { concatUint8Array } from '../utils-isomorphic/stream.js';

// This is not an HTML parser. It reads the head React renders, and stops at
// anything else it finds in one, including markup passed through by
// `dangerouslySetInnerHTML`, so the scan then merges nothing and the response
// is served as rendered.

export type MetadataFilter = {
  metaNames: readonly string[];
  metaProperties: readonly string[];
};

const DEFAULT_METADATA_FILTER: MetadataFilter = {
  metaNames: ['description'],
  metaProperties: [
    'og:title',
    'og:type',
    'og:url',
    'og:description',
    'og:determiner',
    'og:site_name',
    'og:locale',
  ],
};

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'title']);

const SCANNED_ELEMENTS = new Set([
  ...RAW_TEXT_ELEMENTS,
  '!doctype',
  'base',
  'head',
  'html',
  'link',
  'meta',
]);

type Char = string | undefined;

const isSpace = (char: Char): boolean =>
  char === ' ' ||
  char === '\t' ||
  char === '\n' ||
  char === '\f' ||
  char === '\r';

const endsTagName = (char: Char): boolean =>
  isSpace(char) || char === '/' || char === '>';

const endsAttributeName = (char: Char): boolean =>
  endsTagName(char) || char === '=';

const endsBareValue = (char: Char): boolean => isSpace(char) || char === '>';

type Tag = {
  name: string;
  closing: boolean;
  end: number;
  attributes: Map<string, string>;
};

const readTag = (html: string, start: number): Tag | undefined => {
  let cursor = start + 1;
  const closing = html[cursor] === '/';
  if (closing) {
    cursor++;
  }
  const nameStart = cursor;
  while (cursor < html.length && !endsTagName(html[cursor])) {
    cursor++;
  }
  const name = html.slice(nameStart, cursor).toLowerCase();
  const attributes = new Map<string, string>();
  while (cursor < html.length) {
    const char = html[cursor];
    if (isSpace(char)) {
      cursor++;
      continue;
    }
    if (char === '>') {
      return { name, closing, end: cursor + 1, attributes };
    }
    if (char === '/') {
      cursor++;
      continue;
    }
    const attributeStart = cursor;
    do {
      cursor++;
    } while (cursor < html.length && !endsAttributeName(html[cursor]));
    const attribute = html.slice(attributeStart, cursor).toLowerCase();
    while (cursor < html.length && isSpace(html[cursor])) {
      cursor++;
    }
    if (html[cursor] !== '=') {
      if (!attributes.has(attribute)) {
        attributes.set(attribute, '');
      }
      continue;
    }
    cursor++;
    while (cursor < html.length && isSpace(html[cursor])) {
      cursor++;
    }
    const quote = html[cursor];
    const quoted = quote === '"' || quote === "'";
    if (quoted) {
      cursor++;
    }
    const valueStart = cursor;
    while (
      cursor < html.length &&
      (quoted ? html[cursor] !== quote : !endsBareValue(html[cursor]))
    ) {
      cursor++;
    }
    if (!attributes.has(attribute)) {
      attributes.set(attribute, html.slice(valueStart, cursor));
    }
    if (quoted) {
      cursor++;
    }
  }
  return undefined;
};

const findRawTextEnd = (html: string, from: number, name: string): number => {
  let cursor = from;
  while ((cursor = html.indexOf('</', cursor)) !== -1) {
    const nameEnd = cursor + 2 + name.length;
    if (
      html.slice(cursor + 2, nameEnd).toLowerCase() === name &&
      endsTagName(html[nameEnd])
    ) {
      const tag = readTag(html, cursor);
      return tag === undefined ? -1 : tag.end;
    }
    cursor += 2;
  }
  return -1;
};

// `<!--` then `<script` puts the tokenizer in its double escaped state, where
// the next `</script>` does not close the element.
const entersDoubleEscape = (content: string): boolean =>
  content.includes('<!--') && /<script/i.test(content);

const NAMING_ATTRIBUTES = [
  'charset',
  'http-equiv',
  'itemprop',
  'name',
  'property',
];

const namesItselfTwice = (tag: Tag): boolean => {
  const names = NAMING_ATTRIBUTES.filter((attribute) =>
    tag.attributes.has(attribute),
  ).length;
  return tag.name === 'title' ? names > 0 : names > 1;
};

const declaresValue = (tag: Tag): boolean =>
  tag.name === 'title' || tag.attributes.has('content');

const readMetadataKey = (
  tag: Tag,
  filter: MetadataFilter,
): string | undefined => {
  if (tag.name === 'title') {
    return 'title';
  }
  if (tag.name !== 'meta') {
    return undefined;
  }
  const name = tag.attributes.get('name')?.toLowerCase();
  if (name !== undefined && filter.metaNames.includes(name)) {
    return 'name:' + name;
  }
  const property = tag.attributes.get('property');
  if (property !== undefined && filter.metaProperties.includes(property)) {
    return 'property:' + property;
  }
  return undefined;
};

const encoder = new TextEncoder();

// Each byte decodes to one character, so an offset in the text is an offset in
// the bytes. The label means windows-1252, which moves a few bytes above ASCII
// but none into it, and ASCII is all the scan compares.
const decoder = new TextDecoder('latin1');

type MetadataSpan = {
  key: string;
  declaresValue: boolean;
  start: number;
  end: number;
};

type HeadScan = {
  resumeAt: number;
  spans: MetadataSpan[];
  filter: MetadataFilter;
};

const textToLatin1 = (text: string): string =>
  decoder.decode(encoder.encode(text));

const createHeadScan = (filter: Partial<MetadataFilter>): HeadScan => ({
  resumeAt: 0,
  spans: [],
  filter: {
    metaNames: (filter.metaNames ?? DEFAULT_METADATA_FILTER.metaNames).map(
      (name) => textToLatin1(name).toLowerCase(),
    ),
    metaProperties: (
      filter.metaProperties ?? DEFAULT_METADATA_FILTER.metaProperties
    ).map(textToLatin1),
  },
});

const scanHead = (html: string, scan: HeadScan): boolean => {
  while (true) {
    const found = html.indexOf('<', scan.resumeAt);
    const start = found === -1 ? html.length : found;
    for (let i = scan.resumeAt; i < start; i++) {
      if (!isSpace(html[i])) {
        scan.spans.length = 0;
        return true;
      }
    }
    if (found === -1) {
      scan.resumeAt = html.length;
      return false;
    }
    const tag = readTag(html, start);
    if (tag === undefined) {
      scan.resumeAt = start;
      return false;
    }
    if (!SCANNED_ELEMENTS.has(tag.name)) {
      scan.spans.length = 0;
      return true;
    }
    if (tag.closing) {
      if (tag.name === 'head') {
        return true;
      }
      if (tag.name === 'html') {
        scan.spans.length = 0;
        return true;
      }
      scan.resumeAt = tag.end;
      continue;
    }
    let end = tag.end;
    if (RAW_TEXT_ELEMENTS.has(tag.name)) {
      end = findRawTextEnd(html, tag.end, tag.name);
      if (end === -1) {
        scan.resumeAt = start;
        return false;
      }
      if (
        tag.name === 'script' &&
        entersDoubleEscape(html.slice(tag.end, end))
      ) {
        scan.spans.length = 0;
        return true;
      }
    }
    const key = readMetadataKey(tag, scan.filter);
    if (key !== undefined) {
      if (namesItselfTwice(tag)) {
        scan.spans.length = 0;
        return true;
      }
      scan.spans.push({ key, declaresValue: declaresValue(tag), start, end });
    }
    scan.resumeAt = end;
  }
};

const findSuperseded = (spans: readonly MetadataSpan[]): MetadataSpan[] => {
  const lastStartByKey = new Map<string, number>();
  for (const span of spans) {
    if (span.declaresValue) {
      lastStartByKey.set(span.key, span.start);
    }
  }
  return spans.filter((span) => {
    const lastStart = lastStartByKey.get(span.key);
    return lastStart !== undefined && lastStart !== span.start;
  });
};

const spliceMetadata = (
  bytes: Uint8Array,
  spans: readonly MetadataSpan[],
): Uint8Array => {
  const parts: Uint8Array[] = [];
  let cursor = 0;
  for (const span of findSuperseded(spans)) {
    parts.push(bytes.subarray(cursor, span.start));
    cursor = span.end;
  }
  parts.push(bytes.subarray(cursor));
  return concatUint8Array(parts);
};

const DEFAULT_MAX_BUFFERED_HEAD = 1024 * 1024;

export const dedupeHeadMetadataForTest = (
  head: string,
  filter: Partial<MetadataFilter> = {},
): string => {
  const bytes = encoder.encode(head);
  const scan = createHeadScan(filter);
  const merged = scanHead(decoder.decode(bytes), scan)
    ? spliceMetadata(bytes, scan.spans)
    : bytes;
  return new TextDecoder().decode(merged);
};

export const dedupeHtmlMetadataStream = (
  filter: Partial<MetadataFilter> = {},
  maxBufferedHead = DEFAULT_MAX_BUFFERED_HEAD,
): TransformStream<Uint8Array, Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let html = '';
  let tail = '';
  let scanning = false;
  const scan = createHeadScan(filter);
  let buffering = true;

  return new TransformStream({
    transform(chunk, controller) {
      if (!buffering) {
        controller.enqueue(chunk);
        return;
      }
      chunks.push(chunk);
      const text = decoder.decode(chunk);
      // Reading a growing head again on every chunk is quadratic in its size,
      // and a head React renders ends at `</head>`, so the scan starts there.
      const recent = tail + text;
      scanning ||= /<\/head/i.test(recent);
      tail = recent.slice(1 - '</head'.length);
      html += text;
      const finished = scanning && scanHead(html, scan);
      if (!finished && html.length <= maxBufferedHead) {
        return;
      }
      buffering = false;
      const bytes = concatUint8Array(chunks);
      controller.enqueue(finished ? spliceMetadata(bytes, scan.spans) : bytes);
      chunks.length = 0;
      html = '';
    },
    flush(controller) {
      if (buffering && chunks.length) {
        controller.enqueue(concatUint8Array(chunks));
      }
    },
  });
};
