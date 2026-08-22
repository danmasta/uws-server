import { TYPES } from 'lo';

export const SYMBOLS = {
    req: Symbol('request'),
    res: Symbol('response'),
    state: Symbol('state'),
    headers: Symbol('headers')
};

export const METHODS_HTTP = {
    get: 'GET',
    head: 'HEAD',
    options: 'OPTIONS',
    trace: 'TRACE',
    put: 'PUT',
    delete: 'DELETE',
    post: 'POST',
    patch: 'PATCH',
    connect: 'CONNECT'
};

export const METHODS_UWS = {
    any: 'any',
    get: 'get',
    head: 'head',
    options: 'options',
    trace: 'trace',
    put: 'put',
    delete: 'del',
    del: 'del',
    post: 'post',
    patch: 'patch',
    connect: 'connect'
};

export const REGEX = {
    // https://datatracker.ietf.org/doc/html/rfc3986#section-5.2.4
    dot: /\.+[\/\\]+/,
    ext: /\.([a-zA-Z0-9]+)$/
};

// Max chunks to buffer
export const HIGH_WATER_MARK = 32;

// Max unread body bytes to drain when discarding
// Note: Larger or unknown remainders close connection instead
export const DISCARD_MAX = 32768;

// Body type categories
// Note: Map lookup keeps dispatch O(1), and the category switch in respond
// compiles to a jump table (~42 ns/op to ~6)
export const BODY = {
    unknown: 0,
    string: 1,
    blob: 2,
    file: 3,
    empty: 4,
    stream: 5,
    transform: 6,
    readable: 7,
    json: 8,
    view: 9,
    arraybuffer: 10,
    bytes: 11
};

export const BODY_TYPES = new Map([
    [TYPES.String, BODY.string],
    [TYPES.Blob, BODY.blob],
    [TYPES.File, BODY.file],
    [TYPES.Null, BODY.empty],
    [TYPES.Undefined, BODY.empty],
    [TYPES.ReadableStream, BODY.stream],
    [TYPES.TransformStream, BODY.transform],
    [TYPES.CompressionStream, BODY.transform],
    [TYPES.Readable, BODY.readable],
    [TYPES.ReadStream, BODY.readable],
    [TYPES.Duplex, BODY.readable],
    [TYPES.Transform, BODY.readable],
    [TYPES.PassThrough, BODY.readable],
    [TYPES.Number, BODY.json],
    [TYPES.Boolean, BODY.json],
    [TYPES.NaN, BODY.json],
    [TYPES.Infinity, BODY.json],
    [TYPES.Array, BODY.json],
    [TYPES.Object, BODY.json],
    [TYPES.Date, BODY.json],
    [TYPES.DataView, BODY.view],
    [TYPES.Uint16Array, BODY.view],
    [TYPES.Uint32Array, BODY.view],
    [TYPES.Int8Array, BODY.view],
    [TYPES.Int16Array, BODY.view],
    [TYPES.Int32Array, BODY.view],
    [TYPES.Float32Array, BODY.view],
    [TYPES.Float64Array, BODY.view],
    [TYPES.ArrayBuffer, BODY.arraybuffer],
    [TYPES.Buffer, BODY.bytes],
    [TYPES.Uint8Array, BODY.bytes]
]);
