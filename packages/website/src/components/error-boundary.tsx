import { Component } from 'react';
import type { ReactNode, FunctionComponent } from 'react';

interface Props {
  fallback: (error: unknown) => ReactNode;
  children: ReactNode;
}

class ErrorBoundaryClass extends Component<Props, { error?: unknown }> {
  constructor(props: Props) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if ('error' in this.state) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

export const ErrorBoundary =
  ErrorBoundaryClass as unknown as FunctionComponent<Props>;
