export type TypeGuard<From, To extends From> = (from: From) => from is To;

export function hasStringProperty<
  Key extends string | number | symbol,
  Optional extends boolean,
>(
  obj: object,
  key: Key,
  options?: { optional?: Optional },
): obj is false extends Optional
  ? { [key in Key]: string }
  : { [key in Key]?: string } {
  const child = (obj as { [key in Key]?: unknown })[key] as unknown;
  if (child === undefined) return options?.optional === true;
  return typeof child === 'string';
}

export function assertStringProperty<
  Key extends string | number | symbol,
  Optional extends boolean,
>(
  obj: object,
  key: Key,
  options?: { optional?: Optional },
): asserts obj is false extends Optional
  ? { [key in Key]: string }
  : { [key in Key]?: string } {
  if (!hasStringProperty(obj, key, options))
    throw new TypeError(`expect type of "${String(key)}" to be string`);
}

export function hasNumberProperty<
  Key extends string | number | symbol,
  Optional extends boolean,
>(
  obj: object,
  key: Key,
  options?: { optional?: Optional },
): obj is false extends Optional
  ? { [key in Key]: number }
  : { [key in Key]?: number } {
  const child = (obj as { [key in Key]?: unknown })[key] as unknown;
  if (child === undefined) return options?.optional === true;
  return typeof child === 'number';
}

export function assertNumberProperty<
  Key extends string | number | symbol,
  Optional extends boolean,
>(
  obj: object,
  key: Key,
  options?: { optional?: Optional },
): asserts obj is false extends Optional
  ? { [key in Key]: number }
  : { [key in Key]?: number } {
  if (!hasNumberProperty(obj, key, options))
    throw new TypeError(`expect type of "${String(key)}" to be number`);
}

export function hasObjectProperty<
  Key extends string | number | symbol,
  Type extends object,
  Optional extends boolean,
>(
  obj: object,
  key: Key,
  options?: {
    typeGuard?: (obj: object) => obj is Type;
    optional?: Optional;
  },
): obj is false extends Optional
  ? { [key in Key]: Type }
  : { [key in Key]?: Type } {
  const { typeGuard, optional } = options ?? {};
  const child = (obj as { [key in Key]?: unknown })[key];
  if (child === undefined) return optional === true;
  return (
    typeof child === 'object' && child !== null && typeGuard?.(child) !== false
  );
}

export function assertObjectProperty<
  Key extends string | number | symbol,
  Type extends object,
  Optional extends boolean,
>(
  obj: object,
  key: Key,
  options?: {
    typeGuard?: (obj: object) => obj is Type;
    expectedType?: string;
    optional?: Optional;
  },
): asserts obj is false extends Optional
  ? { [key in Key]: Type }
  : { [key in Key]?: Type } {
  const { expectedType = 'object' } = options ?? {};
  if (!hasObjectProperty(obj, key, options))
    throw new TypeError(
      `expect type of "${String(key)}" to be ${expectedType}`,
    );
}
