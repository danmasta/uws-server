import { BaseError } from 'lo/errors';

const encoder = new TextEncoder();

export class ServerError extends BaseError {
    static code = 'ERR_SERVER';
}

export class RequestError extends BaseError {
    static code = 'ERR_REQUEST';
}

export class ResponseError extends BaseError {
    static code = 'ERR_RESPONSE';
}

export function proto (ssl=false) {
    return ssl ? 'https' : 'http';
}

export function strToUint8Array (str) {
    return encoder.encode(str);
}
