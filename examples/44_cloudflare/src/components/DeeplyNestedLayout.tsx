export const DeeplyNestedLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <div>
      <h3>Deeply Nested Layout</h3>
      {children}
    </div>
  );
};
