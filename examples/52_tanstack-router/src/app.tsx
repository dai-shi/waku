import { Router } from './router';

export const App = () => {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Waku</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style type="text/tailwindcss">
          {`html {
        color-scheme: light dark;
      }
      * {
        @apply border-gray-200 dark:border-gray-800;
      }
      body {
        @apply bg-gray-50 text-gray-950 dark:bg-gray-900 dark:text-gray-200;
      }`}
        </style>
      </head>
      <body>
        <Router />
      </body>
    </html>
  );
};
