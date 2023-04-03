export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
): Promise<{ url: string }> {
  if (specifier.endsWith(".js")) {
    for (const ext of [".js", ".ts", ".tsx"]) {
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

export async function load(
  url: string,
  context: any,
  nextLoad: any
): Promise<{ format: string; shortCircuit?: boolean; source: any }> {
  const result = await nextLoad(url, context, nextLoad);
  console.log('---', url, result);
  if (result.format === "module") {
    if (typeof result.source !== "string") {
      const source = result.source.toString("utf8");
      return { ...result, source };
    }
  }
  return result;
}
