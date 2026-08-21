import { ipFamily, toIp } from 'lo';
import { BaseError } from 'lo/errors';
import { SYMBOLS } from './constants.js';

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

export function getHeaderEntries (req) {
    let arr = [];
    req.forEach((key, val) => {
        arr.push([key, val]);
    });
    return arr;
}

export function strToUint8Array (str) {
    return encoder.encode(str);
}

// Parse a range header against a known file size
// Note: Only the last range in a list is used
// Note: Returns [start, end] when satisfiable, null when unsatisfiable (416),
// undefined when absent or invalid (serve the full file)
export function parseRange (str, size) {
    if (!str || !str.startsWith('bytes=')) {
        return;
    }
    let range = str.slice(6).split(',').pop().trim();
    let i = range.indexOf('-');
    if (i < 0) {
        return;
    }
    let start = range.slice(0, i).trim();
    let end = range.slice(i + 1).trim();
    // Suffix form (last n bytes)
    if (!start) {
        let n = Number(end);
        if (!end || !Number.isInteger(n) || n < 0) {
            return;
        }
        if (!n || !size) {
            return null;
        }
        return [size > n ? size - n : 0, size - 1];
    }
    let head = Number(start);
    if (!Number.isInteger(head) || head < 0) {
        return;
    }
    let tail = end ? Number(end) : size - 1;
    if (!Number.isInteger(tail) || (end && tail < head)) {
        return;
    }
    if (head >= size) {
        return null;
    }
    return [head, tail < size ? tail : size - 1];
}

// Create a conninfo function from a framework specific socket getter
// Note: getRemotePort was added in uWS v20.61.0
// https://github.com/uNetworking/uWebSockets.js/releases/tag/v20.61.0
export function createConninfo (getSocket) {
    return function conninfo (c, { proxy=false }={}) {
        let addr, port, socket = getSocket(c);
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
    };
}

// Generic conninfo (reads socket from the request state)
export const conninfo = createConninfo(req => req[SYMBOLS.state].socket);
