export const SYMBOLS = {
    request: Symbol('request'),
    response: Symbol('response'),
    state: Symbol('state')
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
    ext: /\.([a-zA-Z0-9]+)$/,
    range: /\W+/
};

export {
    SYMBOLS as SYM
};
