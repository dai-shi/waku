import type { FunctionComponent } from "react";

export type GetEntry = (
  id: string
) => Promise<FunctionComponent | { default: FunctionComponent }>;

// export function defineGetEntry(getEntry: GetEntry): GetEntry {
//   return getEntry;
// }

export type Prerenderer = (
  path: string
) => Promise<Iterable<readonly [id: string, props: unknown]>>;

// export function definePrerenderer(prerenderer: Prerenderer): Prerenderer {
//   return prerenderer;
// }

export type StaticSiteGenerator = () => Promise<
  Iterable<readonly [id: string, props: unknown]>
>;

// export function defineStaticSiteGenerator(
//   staticSiteGenerator: StaticSiteGenerator
// ): StaticSiteGenerator {
//   return staticSiteGenerator;
// }
