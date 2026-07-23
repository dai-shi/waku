import type { CDPSession, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('performance-track');

test.describe('performance-track', () => {
  // The "Server Components" performance track is a Chromium + dev feature. On
  // Waku's pinned React (19.2.x) each component shows up as a named marker in
  // the track rather than a duration span (spans need React 19.3+), so we
  // assert the markers are present. They only appear because patch-rsdw
  // recovers React's debug info for Waku's plain-object RSC payload, so this
  // exercises that patch end to end.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');
  test.skip(({ mode }) => mode !== 'DEV', 'Dev only');
  // The track entries land after React's deferred performance flush, whose
  // timing varies on loaded CI runners, so retry rather than flake.
  test.describe.configure({ retries: process.env.CI ? 2 : 0 });

  test('emits server component performance tracks', async ({ page }) => {
    const { port, stopApp } = await startApp('DEV');
    try {
      const session = await page.context().newCDPSession(page);

      // Trace the initial SSR render on its own.
      await startTracing(session);
      await page.goto(`http://localhost:${port}/`);
      await expect(
        page.getByText('HomeSlowServerComponent resolved after 500ms'),
      ).toBeVisible();
      await waitForPerformanceFlush(page);
      const initialNames = serverComponentTrackNames(
        await stopTracing(session),
      );

      // Trace the client navigation and its on-demand RSC request on its own.
      await startTracing(session);
      await page.getByRole('link', { name: 'About' }).click();
      await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
      await expect(
        page.getByText('AboutSlowServerComponent resolved after 500ms'),
      ).toBeVisible();
      await waitForPerformanceFlush(page);
      const navigationNames = serverComponentTrackNames(
        await stopTracing(session),
      );

      // Each route renders a distinctly named component twice (300ms, 500ms),
      // so each phase must contribute its own two track entries. The per-route
      // name means neither phase can be satisfied by the other, or by an About
      // prefetch landing in the initial trace.
      const homeEntries = initialNames.filter(
        (name) => name === 'HomeSlowServerComponent',
      );
      const aboutEntries = navigationNames.filter(
        (name) => name === 'AboutSlowServerComponent',
      );
      expect(homeEntries.length).toBeGreaterThanOrEqual(2);
      expect(aboutEntries.length).toBeGreaterThanOrEqual(2);
    } finally {
      await stopApp();
    }
  });
});

async function waitForPerformanceFlush(page: Page): Promise<void> {
  // React flushes performance info on a deferred task with no DOM signal.
  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(2000);
}

//
// CDP tracing helpers
//

// We drive the CDP `Tracing` domain (Tracing.start / tracingComplete stream,
// read via IO): https://chromedevtools.github.io/devtools-protocol/tot/Tracing/
// CDP leaves the individual event opaque (`dataCollected.value: object[]`), so
// this minimal shape follows Chrome's Trace Event Format instead:
// https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
interface TraceEvent {
  cat: string;
  name: string;
}

// React prefixes each track entry name with a zero-width space.
const zeroWidthSpace = String.fromCharCode(0x200b);

async function startTracing(session: CDPSession): Promise<void> {
  await session.send('Tracing.start', {
    categories: '-*,devtools.timeline,blink.user_timing',
    transferMode: 'ReturnAsStream',
  });
}

// Names React wrote to the "Server Components" performance track. Entries live
// in the `blink.user_timing` category and reference the track in their args.
function serverComponentTrackNames(events: TraceEvent[]): string[] {
  return events
    .filter(
      (event) =>
        event.cat.includes('blink.user_timing') &&
        JSON.stringify(event).includes('Server Components'),
    )
    .map((event) => event.name.split(zeroWidthSpace).join(''));
}

async function stopTracing(session: CDPSession): Promise<TraceEvent[]> {
  const tracingComplete = new Promise<string>((resolve, reject) => {
    session.once('Tracing.tracingComplete', ({ stream }) => {
      if (stream) {
        resolve(stream);
      } else {
        reject(new Error('Trace stream is missing'));
      }
    });
  });
  await session.send('Tracing.end');
  const stream = await tracingComplete;
  let trace = '';
  for (;;) {
    const chunk = await session.send('IO.read', { handle: stream });
    trace += chunk.data;
    if (chunk.eof) {
      break;
    }
  }
  await session.send('IO.close', { handle: stream });
  return (JSON.parse(trace) as { traceEvents: TraceEvent[] }).traceEvents;
}
