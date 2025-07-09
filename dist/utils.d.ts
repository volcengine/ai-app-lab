export type TypeGuard<From, To extends From> = (from: From) => from is To;
export declare function hasStringProperty<Key extends string | number | symbol, Optional extends boolean>(obj: object, key: Key, options?: {
    optional?: Optional;
}): obj is false extends Optional ? {
    [key in Key]: string;
} : {
    [key in Key]?: string;
};
export declare function assertStringProperty<Key extends string | number | symbol, Optional extends boolean>(obj: object, key: Key, options?: {
    optional?: Optional;
}): asserts obj is false extends Optional ? {
    [key in Key]: string;
} : {
    [key in Key]?: string;
};
export declare function hasNumberProperty<Key extends string | number | symbol, Optional extends boolean>(obj: object, key: Key, options?: {
    optional?: Optional;
}): obj is false extends Optional ? {
    [key in Key]: number;
} : {
    [key in Key]?: number;
};
export declare function assertNumberProperty<Key extends string | number | symbol, Optional extends boolean>(obj: object, key: Key, options?: {
    optional?: Optional;
}): asserts obj is false extends Optional ? {
    [key in Key]: number;
} : {
    [key in Key]?: number;
};
export declare function hasObjectProperty<Key extends string | number | symbol, Type extends object, Optional extends boolean>(obj: object, key: Key, options?: {
    typeGuard?: (obj: object) => obj is Type;
    optional?: Optional;
}): obj is false extends Optional ? {
    [key in Key]: Type;
} : {
    [key in Key]?: Type;
};
export declare function assertObjectProperty<Key extends string | number | symbol, Type extends object, Optional extends boolean>(obj: object, key: Key, options?: {
    typeGuard?: (obj: object) => obj is Type;
    expectedType?: string;
    optional?: Optional;
}): asserts obj is false extends Optional ? {
    [key in Key]: Type;
} : {
    [key in Key]?: Type;
};
