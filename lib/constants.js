export const SYMBOLS = {
    request: Symbol('request'),
    response: Symbol('response'),
    state: Symbol('state')
};

export const HTTP_METHODS = {
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

export const APP_METHODS = {
    ANY: 'any',
    GET: 'get',
    HEAD: 'head',
    OPTIONS: 'options',
    TRACE: 'trace',
    PUT: 'put',
    DELETE: 'del',
    DEL: 'del',
    POST: 'post',
    PATCH: 'patch',
    CONNECT: 'connect'
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
