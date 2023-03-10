import type { FunctionComponent } from "react";

// module state for both client and server
const idMap = new Map<string, FunctionComponent>();
const componentMap = new Map<FunctionComponent, string>();

export function register(id: string, component: FunctionComponent) {
  idMap.set(id, component);
  componentMap.set(component, id);
}

export function idToComponent(id: string) {
  const component = idMap.get(id);
  if (!component) {
    throw new Error("No component registered");
  }
  return component;
}

export function componentToId(component: FunctionComponent) {
  const id = componentMap.get(component);
  if (!id) {
    throw new Error("Needds to registre component in advance");
  }
  return id;
}
