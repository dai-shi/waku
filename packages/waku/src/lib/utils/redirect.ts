import { addBase } from './path.js';

const hasControlCharacter = (value: string) =>
  [...value].some((char) => char < ' ' || char === '\u007f');

const getLocationType = (location: string) => {
  if (/^[a-z][a-z\d+.-]*:/i.test(location)) {
    return 'absolute' as const;
  }
  if (location.startsWith('//')) {
    return 'authority' as const;
  }
  return location.startsWith('/')
    ? ('appPath' as const)
    : ('relative' as const);
};

export const resolveRedirectLocation = (
  location: string,
  requestUrl: string,
  basePath: string,
): string | undefined => {
  // a header strips these, so classify what will actually be sent
  location = location.trim();
  const locationType = getLocationType(location);
  if (locationType === 'relative') {
    return hasControlCharacter(location) ? undefined : location;
  }
  const request = new URL(requestUrl);
  let target: URL;
  try {
    target = new URL(location, request);
  } catch {
    return undefined;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return undefined;
  }
  target.username = '';
  target.password = '';
  const path = target.pathname + target.search + target.hash;
  if (target.host !== request.host) {
    return locationType === 'absolute'
      ? target.href
      : '//' + target.host + path;
  }
  // requestUrl takes its scheme from the socket, so http from there is no
  // evidence that the browser is on http
  if (locationType === 'absolute' && target.protocol === 'https:') {
    return target.href;
  }
  return locationType === 'appPath' ? addBase(path, basePath) : path;
};
