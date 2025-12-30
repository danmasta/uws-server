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

export function getScheme (ssl=false) {
    return ssl ? 'https' : 'http';
}

export function getHeaders (httpReq) {
    let kv = [];
    httpReq.forEach((key, val) => {
        kv.push([key, val]);
    });
    return new Headers(kv);
}

export function strToUint8Array (str) {
    return encoder.encode(str);
}

// Note: us_socket_remote_port is not available in uWebSockets.js yet
// https://github.com/uNetworking/uSockets/pull/210
// https://github.com/uNetworking/uWebSockets.js/issues/1160
export function conninfo (c, { proxy=false }={}) {
    let addr, { socket } = c.env;
    if (proxy) {
        addr = toIp(socket.getProxiedRemoteAddress());
    } else {
        addr = toIp(socket.getRemoteAddress());
    }
    return {
        address: addr,
        port: null,
        family: ipFamily(addr)
    };
}
