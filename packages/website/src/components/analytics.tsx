import { getEnv } from 'waku/server';

export const Analytics = () => {
  const trackingId = getEnv('TRACKING_ID');

  if (!trackingId) {
    return null;
  }

  return (
    <>
      <script
        async={true}
        src={`https://www.googletagmanager.com/gtag/js?id=${trackingId}`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${trackingId}');`,
        }}
      />
    </>
  );
};
