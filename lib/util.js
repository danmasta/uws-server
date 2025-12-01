import { BaseError } from 'lo/errors';
import { isIPv4, isIPv6 } from 'node:net';

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

export function family (ip) {
    return isIPv4(ip) ? 'IPv4' : isIPv6(ip) ? 'IPv6' : 'unknown';
}

export function strToUint8Array (str) {
    return encoder.encode(str);
}
