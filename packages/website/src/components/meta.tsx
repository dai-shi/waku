type MetaProps = {
  title: string;
  description: string;
};

export const Meta = ({ title, description }: MetaProps) => {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
    </>
  );
};
