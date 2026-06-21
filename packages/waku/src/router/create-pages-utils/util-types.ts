/**
 * Type version of `String.prototype.split()`. Splits the first string argument by the second string argument
 * @example
 * ```ts
 * // ['a', 'b', 'c']
 * type Case1 = Split<'abc', ''>
 * // ['a', 'b', 'c']
 * type Case2 = Split<'a,b,c', ','>
 * ```
 */
export type Split<
  Str extends string,
  Del extends string | number,
> = string extends Str
  ? string[]
  : '' extends Str
    ? []
    : Str extends `${infer T}${Del}${infer U}`
      ? [T, ...Split<U, Del>]
      : [Str];

/**
 * Accepts a boolean and returns `true` if the passed type is `false`, otherwise returns `true`
 * @example
 * ```ts
 * // false
 * type Case1 = Not<true>
 * // true
 * type Case2 = Not<false>
 * ```
 */
type Not<T extends boolean> = T extends true ? false : true;

/**
 * Returns boolean whether the first argument extends the second argument
 * @example
 * ```ts
 * // true
 * type Case1 = Extends<1, number>
 * // false
 * type Case2 = Extends<number, 1>
 * ```
 */
type Extends<T, Base> = [T] extends [Base] ? true : false;

/**
 * Returns boolean whether the first argument doesn't extend the second argument
 * @example
 * ```ts
 * // false
 * type Case1 = Extends<1, number>
 * // true
 * type Case2 = Extends<number, 1>
 * ```
 */
type NotExtends<T, Base> = Not<Extends<T, Base>>;

/**
 * Returns a boolean whether the first array argument is fixed length tuple
 * @example
 * ```ts
 * // true
 * type Case1 = IsTuple<[1, 2, 3]>
 * // false
 * type Case2 = IsTuple<number[]>
 * ```
 */
type IsTuple<T extends readonly unknown[]> = NotExtends<number, T['length']>;

/**
 * Returns the second argument if the first argument is `true` (defaults to `true`), otherwise returns the third argument (defaults to `false`)
 * ```ts
 * // valid
 * type Case1 = If<true, 'valid'>
 * // invalid
 * type Case2 = If<false, 'valid', 'invalid'>
 * ```
 */
type If<Condition, IfTrue = true, IfFalse = false> = Condition extends true
  ? IfTrue
  : IfFalse;

/**
 * Returns the first argument if it is an empty array, otherwise returns `never`
 * @example
 * ```ts
 * // never
 * type Result = EmptyArray<[1]>
 * ```
 */
type EmptyArray<T extends readonly unknown[]> = T extends readonly [
  unknown,
  ...unknown[],
]
  ? never
  : T;

/**
 * Returns a boolean if the passed type is `never`
 * @example
 * ```ts
 * // true
 * type Case1 = IsNever<never>
 * // false
 * type Case2 = IsNever<true>
 * ```
 */
type IsNever<T> = [T] extends [never] ? true : false;

/**
 * Returns a boolean whether the passed argument is an empty array
 * @example
 * ```ts
 * // false
 * type Result - IsEmptyArray<[1]>
 */
type IsEmptyArray<T extends readonly unknown[]> = If<
  IsNever<EmptyArray<T>>,
  false,
  true
>;

/**
 *  Returns the second argument if the first argument is an empty array (defaults to `true`), otherwise returns the third argument (defaults to `false`)
 * @example
 * ```ts
 * // string
 * type Result = IfEmptyArray<[], string, number>
 * ```
 */
type IfEmptyArray<
  T extends readonly unknown[],
  IfTrue = true,
  IfFalse = false,
> = If<IsEmptyArray<T>, IfTrue, IfFalse>;

/**
 * Type version of `Array.prototype.join()`. Joins the first array argument by the second argument
 * @example
 * ```ts
 * // 'a-p-p-l-e'
 * type Case1 = Join<["a", "p", "p", "l", "e"], "-">
 * // '21212'
 * type Case2 = Join<["2", "2", "2"], 1>
 * // 'o'
 * type Case3 = Join<["o"], "u">
 * ```
 */
export type Join<
  T extends readonly (string | number)[],
  Glue extends string | number,
> =
  IsTuple<T> extends true
    ? T extends readonly [
        infer First extends string | number,
        ...infer Rest extends readonly (string | number)[],
      ]
      ? IfEmptyArray<Rest, First, `${First}${Glue}${Join<Rest, Glue>}`>
      : never
    : never;

/**
 * Replaces all occurrences of the second string argument with the third string argument in the first string argument
 * @example
 * ```ts
 * // 'remove him him'
 * type Case1 = ReplaceAll<'remove me me', 'me', 'him'>
 * // 'remove me me'
 * type Case2 = ReplaceAll<'remove me me', 'us', 'him'>
 * ```
 */
export type ReplaceAll<
  T extends string,
  Pivot extends string,
  ReplaceBy extends string,
> = T extends `${infer A}${Pivot}${infer B}`
  ? ReplaceAll<`${A}${ReplaceBy}${B}`, Pivot, ReplaceBy>
  : T;

/**
 * This helper makes types more readable
 * @see https://www.totaltypescript.com/concepts/the-prettify-helper
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};
