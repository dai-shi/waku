import { Component } from "react";
import type { ReactNode, FunctionComponent } from "react";

interface Props {
  fallback: (error: unknown) => ReactNode;
  children: ReactNode;
}

class ErrorBoundaryClass extends Component<Props, { error?: any }> {
  constructor(props: any) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: any) {
    return { error };
  }

  render() {
    if ("error" in this.state) {
      // You can render any custom fallback UI
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

export const ErrorBoundary =
  ErrorBoundaryClass as unknown as FunctionComponent<Props>;
