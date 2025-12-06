import { ipFamily, toIp } from 'lo';
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

export function getScheme (ssl=false) {
    return ssl ? 'https' : 'http';
}

export function getHeaders (incoming) {
    let kv = [];
    incoming.forEach((key, val) => {
        kv.push([key, val]);
    });
    return new Headers(kv);
}

export function strToUint8Array (str) {
    return encoder.encode(str);
}

export function responseFromError (err, { status=500, message='Unknown Error', showError=true, showStack=false }={}) {
    if (err?.getResponse) {
        return err.getResponse();
    }
    if (showStack) {
        message = `${message}: ${err.stack}`;
    } else if (showError) {
        message = `${message}: ${err.message}`;
    }
    return new Response(message, {
        status
    });
}

export function clientErrorResponse (err, opts) {
    return responseFromError(err, { status: 400, message: 'Client Error', ...opts });
}

export function serverErrorResponse (err, opts) {
    return responseFromError(err, { status: 500, message: 'Server Error', ...opts });
}

// Note: us_socket_remote_port is not available in uWebSockets.js yet
// https://github.com/uNetworking/uSockets/pull/210
// https://github.com/uNetworking/uWebSockets.js/issues/1160
export function conninfo (c, { proxy=false }={}) {
    let addr, { outgoing } = c.env;
    if (proxy) {
        addr = toIp(outgoing.getProxiedRemoteAddress());
    } else {
        addr = toIp(outgoing.getRemoteAddress());
    }
    return {
        address: addr,
        port: null,
        family: ipFamily(addr)
    }
}
