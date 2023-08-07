const mergeArrayWithDedupe = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]))

export function shallowMerge(target: any, obj: any) {
  for (const key of Object.keys(obj)) {
    const oldVal = target[key]
    const newVal = obj[key]

    if(key === 'name' || key === 'version') continue

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      target[key] = mergeArrayWithDedupe(oldVal, newVal)
    } else {
      target[key] = newVal
    }
  }

  return target
}
