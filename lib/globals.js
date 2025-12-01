export const FetchBuiltIn = globalThis.fetch;

Object.defineProperty(globalThis, 'fetch', {
    value: (resource, opts) => {
        return FetchBuiltIn(resource, { compress: false, ...opts });
    }
});
