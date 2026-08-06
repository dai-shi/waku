import { describe, expect, test } from 'vitest';
import { resolveRedirectLocation } from '../src/lib/utils/redirect.js';

const request = 'https://app.example/RSC/R/next.txt';

const resolve = (location: string, basePath = '/') =>
  resolveRedirectLocation(location, request, basePath);

describe('resolveRedirectLocation', () => {
  test('an app path keeps its base applied once', () => {
    expect(resolve('/login')).toBe('/login');
    expect(resolve('/login', '/base/')).toBe('/base/login');
  });

  test('a same host http location gives up its origin', () => {
    // the browser resolves it against the page, so an https app behind a proxy
    // is not sent back to the http the socket reports
    expect(resolve('http://app.example/login?a=1#x')).toBe('/login?a=1#x');
  });

  test('a same host https location is kept, so an app can canonicalise', () => {
    expect(resolve('https://app.example/login')).toBe(
      'https://app.example/login',
    );
    // the base is already in the url it named, so none is added
    expect(resolve('https://app.example/base/login', '/base/')).toBe(
      'https://app.example/base/login',
    );
  });

  test('whitespace a header would strip does not hide another host', () => {
    // ' //evil' is not relative once the header has trimmed it
    expect(resolve(' //other.example/x')).toBe('//other.example/x');
    expect(resolve('  https://other.example/x  ')).toBe(
      'https://other.example/x',
    );
  });

  test('a relative location is left for the browser to resolve', () => {
    // an rsc request is not the page that threw it, so this end cannot say
    // what 'login' is relative to
    expect(resolve('login')).toBe('login');
    expect(resolve('../up')).toBe('../up');
    expect(resolve('log\r\nin')).toBeUndefined();
  });

  test('an authority names the whole path, so it takes no base', () => {
    expect(resolve('//app.example/login', '/base/')).toBe('/login');
    expect(resolve('http://app.example/login', '/base/')).toBe('/login');
  });

  test('credentials never reach a header', () => {
    expect(resolve('https://user:pw@app.example/x')).toBe(
      'https://app.example/x',
    );
    expect(resolve('https://user:pw@other.example/x')).toBe(
      'https://other.example/x',
    );
  });

  test('another host keeps the scheme it named', () => {
    expect(resolve('https://other.example/x')).toBe('https://other.example/x');
  });

  test('another host that named no scheme stays without one', () => {
    expect(resolve('//other.example/x')).toBe('//other.example/x');
    // a backslash is a slash to the url parser, and the browser follows it
    expect(resolve('/\\other.example/x')).toBe('//other.example/x');
  });

  test('a control character never survives into the location', () => {
    // it would be rejected as a header value and take down the response
    expect(resolve('/x\r\nSet-Cookie: a=b')).toBe('/xSet-Cookie:%20a=b');
  });

  test('refuses a scheme the browser must not navigate to', () => {
    expect(resolve('javascript:alert(document.domain)')).toBeUndefined();
    expect(resolve('data:text/html,<script></script>')).toBeUndefined();
    expect(resolve('file:///etc/passwd')).toBeUndefined();
  });

  test('a location that is not a url at all', () => {
    expect(resolve('https://[')).toBeUndefined();
  });
});
