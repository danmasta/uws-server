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

export async function handleResponse (res, outgoing) {

    if (outgoing.aborted) {
        return;
    }

    if (SYM.Response in res) {
        res = res[SYM.Response];
    }

    let buf, len = 0, { status, body, headers } = res;

    if (typeof body === 'string') {
        buf = strToUint8Array(body);
        len = buf.byteLength;
        headers.set('content-length', len);
    } else if (body instanceof Uint8Array) {
        buf = body;
        len = buf.byteLength;
        headers.set('content-length', len);
    } else if (body instanceof Blob) {
        buf = new Uint8Array(await body.arrayBuffer());
        len = buf.byteLength;
        headers.set('content-length', len);
    }

    outgoing.cork(() => {

        outgoing.writeStatus(status.toString());

        headers.forEach((val, key) => {
            outgoing.writeHeader(key, val);
        });

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
            write(buf, len, 0);
        } else if (body) {
            if (body.locked) {
                throw new ResponseError('Response body ReadableStream locked');
            }
            if (outgoing.aborted) {
                return;
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
        } else {
            outgoing.end();
        }

    });
}
