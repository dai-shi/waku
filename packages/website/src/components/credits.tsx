export const Credits = () => {
  if (process.env.VITE_SHOW_CREDITS !== "YES") return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        right: 0,
        padding: "96px 0 0 256px",
        backgroundColor: "transparent",
        backgroundImage:
          'url("https://storage.googleapis.com/candycode/bg.png")',
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        lineHeight: 1,
        pointerEvents: "none",
        overflow: "clip",
      }}
    >
      <a
        href="https://candycode.com/"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: "relative",
          zIndex: "20",
          display: "inline-flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          padding: "16px 16px 16px 16px",
          pointerEvents: "auto",
        }}
      >
        <span
          style={{
            fontFamily: "'Arial', sans-serif",
            fontSize: "11px",
            letterSpacing: "0.125em",
            textTransform: "uppercase",
            color: "#808080",
            marginBottom: "4px",
          }}
        >
          website by
        </span>
        <img
          src="https://storage.googleapis.com/candycode/candycode.svg"
          alt="candycode, an alternative graphic design and web development agency based in San Diego"
          style={{ width: "104px", height: "20px" }}
        />
      </a>
    </div>
  );
};
