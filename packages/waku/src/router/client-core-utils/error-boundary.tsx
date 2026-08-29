import { Component } from 'react';
import type { ReactNode } from 'react';

function renderError(message: string) {
  return (
    <html>
      <head>
        <title>Unhandled Error</title>
      </head>
      <body
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          placeContent: 'center',
          placeItems: 'center',
          fontSize: '16px',
          margin: 0,
        }}
      >
        <h1>Caught an unexpected error</h1>
        <p>Error: {message}</p>
      </body>
    </html>
  );
}

/**
 * Catches errors from its children and shows a fallback page. Used by the
 * default root layout; apps can wrap their own root with it too.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error?: unknown }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {};
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if ('error' in this.state) {
      if (this.state.error instanceof Error) {
        return renderError(this.state.error.message);
      }
      return renderError(String(this.state.error));
    }
    return this.props.children;
  }
}
