'use client';

import {
  ErrorBoundary as ReactErrorBoundary,
  type ErrorBoundaryProps,
} from 'react-error-boundary';

const ErrorBoundary: React.FC<ErrorBoundaryProps> = (props) => {
  return <ReactErrorBoundary {...props} />;
};

export default ErrorBoundary;
