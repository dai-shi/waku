'use client';

import { Component } from 'react';
import type { ReactNode } from 'react';
import { unstable_registerFetchEnhancer } from 'waku/minimal/client';
import { bumpRerenderOrder } from './funcs.js';

declare global {
  interface Window {
    __rerenderOrderRelease?: () => void;
  }
}

// wakujs/waku#2288 needs a Flight row to land while React is yielding on it.
// Hold back the rows that follow the page content and let the component
// rendered just before them release the first one in a microtask: React has
// already suspended on that row by then, and it resumes in a later task.
if (typeof window !== 'undefined') {
  const encoder = new TextEncoder();
  unstable_registerFetchEnhancer((fetchFn) => async (input, init) => {
    const response = await fetchFn(input, init);
    if (!String(input).includes('bumpRerenderOrder')) {
      return response;
    }
    const lines = (await response.text()).split('\n');
    const gateAfter = lines.findIndex((line) =>
      line.includes('rerender-order-count'),
    );
    const held = lines.splice(gateAfter + 1);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(encoder.encode(lines.join('\n') + '\n'));
      },
    });
    const release = () => {
      const line = held.shift();
      if (line !== undefined) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      if (!held.length) {
        controller.close();
        delete window.__rerenderOrderRelease;
      }
    };
    window.__rerenderOrderRelease = release;
    // the rest of the response has to arrive eventually
    setTimeout(() => {
      while (window.__rerenderOrderRelease) {
        release();
      }
    }, 100);
    return new Response(stream, response);
  });
}

export const RerenderOrderTrigger = () => {
  if (typeof window !== 'undefined') {
    queueMicrotask(() => window.__rerenderOrderRelease?.());
  }
  return null;
};

export class RerenderOrderBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <p>error: {String(this.state.error)}</p>;
    }
    return this.props.children;
  }
}

export const RerenderOrderForm = ({ mode }: { mode: string }) => {
  const bump = bumpRerenderOrder.bind(null, mode);
  return (
    <form action={bump}>
      <button type="submit">Bump {mode}</button>
    </form>
  );
};
