export const SYMBOLS = {
    Request: Symbol('Request'),
    Response: Symbol('Response'),
    State: Symbol('State'),
    Cache: Symbol('Cache')
};

export const HTTP_METHODS = {
    Get: 'GET',
    Head: 'HEAD',
    Options: 'OPTIONS',
    Trace: 'TRACE',
    Put: 'PUT',
    Delete: 'DELETE',
    Post: 'POST',
    Patch: 'PATCH',
    Connect: 'CONNECT'
};

export const UWS_METHODS = {
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

export {
    SYMBOLS as SYM
};
