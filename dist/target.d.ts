/**
 * The callee of the function invocation or the receiver of an event
 */
export interface TargetEntity {
    /**
     * Searching scope such as 'system', 'view', 'page', etc. Used by the framework and the client for resolver grouping
     */
    scope: string;
    /**
     * Base condition for target searching
     *
     * If the given `scope` and `target` pair is enough to target an entity then the `instance` field is ignored. For
     * example: `{ scope: 'page', target: 'top' }` refers to the top page in the page stack.
     */
    target: string;
    /**
     * Additional information for target searching when needed
     */
    instance?: string;
}
/**
 * Check whether the input object is a TargetEntity
 *
 * @param input The input object to check
 * @returns Whether the input object is a TargetEntity
 */
export declare function isTargetEntity(input: object): input is TargetEntity;
/**
 * Predefined target entities
 *
 * @category Custom API
 */
export declare const targets: {
    /**
     * Targeting client functionality, including traditional JSB.
     */
    clientAPI: () => TargetEntity;
};
