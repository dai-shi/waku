export async function load(url: string, context: any, nextLoad: any) {
  const result = await nextLoad(url, context, nextLoad);
  if (result.format === "module") {
    let { source } = result;
    if (typeof source !== "string") {
      source = source.toString();
    }
    return { ...result, source };
  }
  return result;
}
