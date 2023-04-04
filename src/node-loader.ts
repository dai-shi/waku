export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
) {
  if (specifier.endsWith(".js")) {
    // Hoped tsx handles it, but doesn't seem so.
    for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
      try {
        return await nextResolve(
          specifier.slice(0, -3) + ext,
          context,
          nextResolve
        );
      } catch (e) {
        // ignored
      }
    }
  }
  return await nextResolve(specifier, context, nextResolve);
}

export async function load(url: string, context: any, nextLoad: any) {
  const result = await nextLoad(url, context, nextLoad);
  if (result.format === "module") {
    let { source } = result;
    if (typeof source !== "string") {
      source = source.toString();
    }
    // HACK pull directive to the root
    // Hope we can configure tsx to avoid this
    const p = source.match(/(?:^|\n|;)("use (client|server)";)/);
    if (p) {
      source = p[1] + source;
    }
    return { ...result, source };
  }
  return result;
}
