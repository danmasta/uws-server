import { getType, isTypedArray, TYPES } from 'lo';
import { SYM } from './constants.js';
import { ResponseError, strToUint8Array } from './util.js';

export function handleError (err, outgoing, includeError=true, msg='Server Error') {
    if (!(err instanceof Error)) {
        err = new Error(`Unknown Error: ${err}`, { cause: err });
    }
    if (includeError) {
        msg = `${msg}: ${err.message}`;
    }
    let res = new Response(msg, { status: err?.status || 500 });
    handleResponse(res, outgoing);
}

export function resFromErr (err, status=500, msg='Unknown Error', includeError=true) {
    if (err?.getResponse) {
        return err.getResponse();
    }
    if (includeError) {
        msg = `${msg}: ${err.message}`;
    }
    return new Response(msg, {
        status
    });
}

export function resFromReqErr (err, includeError) {
    return resFromErr(err, 400, 'Client Error', includeError);
}

export function resFromResErr (err, includeError) {
    return resFromErr(err, 500, 'Server Error', includeError);
}

export function resFromFetchErr (err, includeError) {
    return resFromErr(err, 500, 'Server Error', includeError);
}

// Handles multiple response body types directly
// Serializes JSON types
// Supports ReadableStreams, TypedArrays, Blobs, Files, and Promises
export async function handleResponse (res, outgoing) {

    if (outgoing.aborted) {
        return;
    }

    if (res[SYM.Response]) {
        res = res[SYM.Response];
    }

    let buf, len = 0, { body, headers, status, statusText } = res;

    let type = getType(body);

    if (type === TYPES.Promise) {
        type = getType(body = await body);
    }

    switch (type) {
        case TYPES.String:
            buf = strToUint8Array(body);
            break;
        case TYPES.Blob:
            buf = new Uint8Array(await body.arrayBuffer());
            break;
        case TYPES.File:
            type = TYPES.ReadableStream;
            body = body.stream();
            break;
        case TYPES.Undefined:
        case TYPES.ReadableStream:
            break;
        // JSON types
        case TYPES.Number:
        case TYPES.Boolean:
        case TYPES.Null:
        case TYPES.NaN:
        case TYPES.Infinity:
        case TYPES.Array:
        case TYPES.Object:
        case TYPES.Date:
            headers.set('content-type', 'application/json');
            buf = strToUint8Array(JSON.stringify(body));
            break;
        case TYPES.DataView:
            buf = new Uint8Array(body, body.byteOffset, body.byteLength);
            break;
        case TYPES.ArrayBuffer:
            buf = new Uint8Array(body);
            break;
        // uWS supported types
        case TYPES.Uint8Array:
        case TYPES.Uint16Array:
        case TYPES.Uint32Array:
        case TYPES.Int8Array:
        case TYPES.Int16Array:
        case TYPES.Int32Array:
        case TYPES.Float32Array:
        case TYPES.Float64Array:
            buf = body;
            break;
        default:
            // Uint8ClampedArray
            // Float16Array
            // BigUint64Array
            // BigInt64Array
            if (isTypedArray(body)) {
                buf = new Uint8Array(body);
            }
            break;
    }

    if (buf) {
        headers.set('content-length', buf.byteLength);
    }

    if (body && !headers.has('content-type')) {
        headers.set('content-type', 'text/plain; charset=utf-8');
    }

    outgoing.cork(() => {

        if (statusText) {
            outgoing.writeStatus(`${status} ${statusText}`);
        } else {
            outgoing.writeStatus(`${status}`);
        }

        if (headers) {
            for (const [key, val] of headers) {
                outgoing.writeHeader(key, val);
            }
        }

        if (buf) {
            function write (buf, len, offset) {
                if (offset) {
                    buf = buf.subarray(offset);
                }
                let [ok, done] = outgoing.tryEnd(buf, len);
                if (done) {
                    return done;
                }
                if (!ok) {
                    outgoing.onWritable(offset => {
                        return write(buf, len, offset);
                    });
                }
                return ok;
            }
            write(buf, buf.byteLength, 0);
        } else {
            switch (type) {
                case TYPES.Undefined:
                    outgoing.end();
                    break;
                case TYPES.ReadableStream:
                    if (outgoing.aborted) {
                        return;
                    }
                    if (body.locked) {
                        throw new ResponseError('Response body ReadableStream locked');
                    }
                    // Note: Chunked Encoding Mode
                    let reader = body.getReader();
                    reader.read().then(function write ({ done, value }) {
                        if (done) {
                            return outgoing.end();
                        }
                        len += value.byteLength;
                        if (!outgoing.write(value)) {
                            outgoing.onWritable(() => {
                                reader.read().then(write);
                                return true;
                            });
                        } else {
                            reader.read().then(write);
                        }
                    });
                    break;
                default:
                    throw new ResponseError('Response body type not supported: %s', type.name);
            }
        }

    });
}
