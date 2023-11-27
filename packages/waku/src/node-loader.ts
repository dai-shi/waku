import type { LoadHook } from "node:module";
import { ResolveHook } from "node:module";
import * as RSDWNodeLoader from "react-server-dom-webpack/node-loader";
import { LoadFnOutput, LoadHookContext } from "module";

export const load: LoadHook = async (url, context, nextLoad) => {
  return RSDWNodeLoader.load(url, context, async (
    reqUrl: string,
    context?: LoadHookContext
  ): Promise<LoadFnOutput> => {
    const result: LoadFnOutput = await nextLoad(reqUrl, context);
    if (result.format === "module") {
      let { source } = result;
      if (source && typeof source !== "string") {
        source = source.toString();
        return { ...result, source };
      }
    }
    return result
  });
};

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  return RSDWNodeLoader.resolve(specifier, {
    ...context,
    conditions: [...context.conditions, "react-server"]
  }, nextResolve);
};
