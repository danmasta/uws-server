import { ipFamily, toIp } from 'lo';
import { BaseError } from 'lo/errors';

const encoder = new TextEncoder();

export async function uWSImport () {
    try {
        try {
            return (await import('uws')).default;
        } catch (err) {
            return (await import('uWebSockets.js')).default;
        }
    } catch (err) {
        throw new ServerError(err, 'uWebSockets not found');
    }
}

export class ServerError extends BaseError {
    static code = 'ERR_SERVER';
}

export class RequestError extends BaseError {
    static code = 'ERR_REQUEST';
}

export class ResponseError extends BaseError {
    static code = 'ERR_RESPONSE';
}

export class ServeStaticError extends BaseError {
    static code = 'ERR_SERVE_STATIC';
}

export function getScheme (ssl=false) {
    return ssl ? 'https' : 'http';
}

export function getHeaders (req) {
    let arr = [];
    req.forEach((key, val) => {
        arr.push([key, val]);
    });
    return new Headers(arr);
}

export function strToUint8Array (str) {
    return encoder.encode(str);
}

// Note: getRemotePort was added in uWS v20.61.0
// https://github.com/uNetworking/uWebSockets.js/releases/tag/v20.61.0
export function conninfo (c, { proxy=false }={}) {
    let addr, port, { socket } = c.env;
    if (proxy) {
        addr = toIp(socket.getProxiedRemoteAddress());
        port = socket.getProxiedRemotePort?.();
    } else {
        addr = toIp(socket.getRemoteAddress());
        port = socket.getRemotePort?.();
    }
    return {
        address: addr,
        port,
        family: ipFamily(addr)
    };
}
