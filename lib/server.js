import {
    defaults,
    each,
    getType,
    ipFamily,
    isFunction,
    isTypedArray,
    noop,
    toArray,
    TYPES
} from 'lo';
import process from 'node:process';
import { Readable } from 'node:stream';
import {
    DISCARD_MAX,
    METHODS_UWS as METHODS,
    SYMBOLS
} from './constants.js';
import { Request, uWSRequest } from './request.js';
import { uWSResponse } from './response.js';
import { Sockets } from './sockets.js';
import {
    getScheme,
    ResponseError,
    ServerError,
    strToUint8Array,
    uWSImport
} from './util.js';

const defs = {
    fetch: undefined,
    bind: '::',
    port: undefined,
    defaultHost: undefined,
    ssl: false,
    http3: false,
    createServer,
    app: undefined,
    uws: undefined,
    globals: true,
    discardMax: DISCARD_MAX,
    showError: true,
    showStack: false,
    log: undefined,
    timeout: 10000,
    listen: false,
    signals: ['SIGINT', 'SIGTERM'],
    exitOnSignal: true,
    handleUncaught: true,
    exitOnUncaught: true,
    shutdown: undefined
};

// Note: Opts must be an object (uWS crashes on undefined)
function createServer (uws, opts={}, ssl, http3) {
    if (http3) {
        return uws.H3App(opts);
    }
    if (ssl) {
        return uws.SSLApp(opts);
    }
    return uws.App(opts);
}

// Body type categories
// Note: Map lookup keeps dispatch O(1), and the type switch in respond
// compiles to a jump table (~42 ns/op to ~6)
const BODY = {
    unknown: 0,
    string: 1,
    blob: 2,
    file: 3,
    empty: 4,
    stream: 5,
    transform: 6,
    readable: 7,
    json: 8,
    view: 9,
    arraybuffer: 10,
    bytes: 11
};

const BODY_TYPES = new Map([
    [TYPES.String, BODY.string],
    [TYPES.Blob, BODY.blob],
    [TYPES.File, BODY.file],
    [TYPES.Null, BODY.empty],
    [TYPES.Undefined, BODY.empty],
    [TYPES.ReadableStream, BODY.stream],
    [TYPES.TransformStream, BODY.transform],
    [TYPES.CompressionStream, BODY.transform],
    [TYPES.Readable, BODY.readable],
    [TYPES.ReadStream, BODY.readable],
    [TYPES.Duplex, BODY.readable],
    [TYPES.Transform, BODY.readable],
    [TYPES.PassThrough, BODY.readable],
    [TYPES.Number, BODY.json],
    [TYPES.Boolean, BODY.json],
    [TYPES.NaN, BODY.json],
    [TYPES.Infinity, BODY.json],
    [TYPES.Array, BODY.json],
    [TYPES.Object, BODY.json],
    [TYPES.Date, BODY.json],
    [TYPES.DataView, BODY.view],
    [TYPES.Uint16Array, BODY.view],
    [TYPES.Uint32Array, BODY.view],
    [TYPES.Int8Array, BODY.view],
    [TYPES.Int16Array, BODY.view],
    [TYPES.Int32Array, BODY.view],
    [TYPES.Float32Array, BODY.view],
    [TYPES.Float64Array, BODY.view],
    [TYPES.ArrayBuffer, BODY.arraybuffer],
    [TYPES.Buffer, BODY.bytes],
    [TYPES.Uint8Array, BODY.bytes]
]);

export class uWSServer {

    constructor (opts, fn, supp) {

        if (isFunction(opts)) {
            [opts, fn] = [fn, opts];
        }

        this.opts = opts = defaults(opts, supp, defs);

        let {
            fetch,
            bind,
            defaultHost,
            ssl,
            uws,
            globals,
            discardMax,
            log,
            listen,
            signals,
            exitOnSignal,
            handleUncaught,
            exitOnUncaught,
            shutdown
        } = opts;

        if (!isFunction(fetch)) {
            fetch = opts.fetch = fetch?.fetch || fetch;
        }

        if (!fetch) {
            throw new ServerError('Fetch required');
        }

        let sockets, scheme, server = this;

        this.uws = uws;
        this.app = null;
        this.socket = null;
        this.port = null;
        this.sockets = sockets = new Sockets();
        this.scheme = scheme = getScheme(ssl);
        this.family = ipFamily(bind);
        this.shutdownHandlers = new Set(toArray(shutdown));
        this.log = log ||= console;
        this.exiting = false;
        this.handlers = [];
        this.promise = {
            init: undefined,
            listen: undefined
        };

        this.register(METHODS.any, '/*', async (socket, inc) => {
            let req, res;
            socket.onAborted(() => {
                socket.aborted = true;
                socket.onAbort?.();
                if (req) {
                    req.abort();
                }
                sockets.delete(socket);
            });
            sockets.add(socket);
            try {
                req = new uWSRequest(inc, socket, { defaultHost, scheme });
            } catch (err) {
                log.error(new ServerError(err, 'Uncaught request exception'));
                return this.clientError(err, socket);
            }
            try {
                res = await fetch(req, { req: inc, socket, server });
            } catch (err) {
                log.error(new ServerError(err, 'Uncaught fetch exception'));
                req.discard(discardMax);
                return this.serverError(err, socket);
            }
            try {
                req.discard(discardMax);
                await this.respond(res, socket);
            } catch (err) {
                log.error(new ServerError(err, 'Uncaught response exception'));
                this.error(err, socket);
            }
        });

        if (globals) {
            if (globalThis.Request !== Request) {
                Object.defineProperty(globalThis, 'Request', {
                    value: Request
                });
            }
            if (globalThis.Response !== uWSResponse) {
                Object.defineProperty(globalThis, 'Response', {
                    value: uWSResponse
                });
            }
        }

        // Handle shutdown signals
        if (signals) {
            each(signals, signal => {
                process.once(signal, async signal => {
                    log.info('Received signal: %s, shutting down', signal);
                    await this.close();
                    if (exitOnSignal) {
                        this.exit();
                    }
                });
            });
        }

        // Handle uncaught exceptions and promise rejections
        if (handleUncaught) {
            process.on('uncaughtException', async err => {
                log.error(new ServerError(err, 'Uncaught exception'));
                if (exitOnUncaught) {
                    await this.close();
                    this.exit(1);
                }
            });
            process.on('unhandledRejection', async err => {
                log.error(new ServerError(err, 'Unhandled promise rejection'));
                if (exitOnUncaught) {
                    await this.close();
                    this.exit(1);
                }
            });
        }

        if (listen || fn) {
            this.listen(fn);
        }

    }

    async init () {

        let init = this.promise.init;
        if (init) {
            return init.promise;
        }
        init = this.promise.init = Promise.withResolvers();

        let uws = this.uws ||= await uWSImport();
        let { createServer, app, ssl, http3 } = this.opts;

        this.app = createServer(uws, app, ssl, http3);

        each(this.handlers, ([method, route, fn]) => {
            this.app[METHODS[method]](route, fn);
        });

        init.resolve();

    }

    // Accepts function or promise
    addShutdownHandler (handler) {
        if (handler) {
            this.shutdownHandlers.add(handler);
        }
    }

    register (method=METHODS.get, route, fn) {
        if (!METHODS[method]) {
            throw new ServerError('Method not supported: %s', method);
        }
        if (this.app) {
            this.app[METHODS[method]](route, fn);
        } else {
            this.handlers.push([method, route, fn]);
        }
    }

    async listen (fn) {
        let listen = this.promise.listen;
        if (listen) {
            return listen.promise;
        }
        listen = this.promise.listen = Promise.withResolvers();
        await this.init();
        let { uws, app, log, opts: { bind, port }} = this;
        app.listen(bind, port, socket => {
            if (socket) {
                this.socket = socket;
                this.port = uws.us_socket_local_port(socket);
                let addr = this.address();
                if (fn) {
                    fn(addr, this);
                } else {
                    log.info('uWS server listening on %s:%d', addr.address, addr.port);
                }
            } else {
                listen.reject(new ServerError('Server failed to listen'));
            }
        });
        return listen.promise;
    }

    // Stop accepting new connections
    stop () {
        if (this.socket) {
            this.uws.us_listen_socket_close(this.socket);
            this.socket = null;
        }
    }

    exit (code=0) {
        if (!this.exiting) {
            this.exiting = true;
            this.log.info('Exiting process');
            process.nextTick(() => {
                process.exit(code);
            });
        }
    }

    // Drain open connections
    // Note: Keep-alive timeout is hardcoded to 10s
    // https://github.com/uNetworking/uWebSockets/blob/master/src/HttpContext.h#L44
    drain () {
        return new Promise((resolve, reject) => {
            let { log, sockets, opts: { timeout }} = this;
            if (!sockets.size) {
                log.info('Connections empty');
                resolve();
            } else {
                log.info('Waiting: %d ms for: %d connections to drain', timeout, sockets.size);
                let timer = setTimeout(() => {
                    sockets.off('empty', clear);
                    log.info('Closing remaining connections: %d', sockets.size);
                    each(sockets, socket => {
                        if (!socket.aborted && !socket.done) {
                            try {
                                socket.close();
                            } catch (err) {
                                log.warn('Failed to close socket: %s', err);
                            }
                        }
                        sockets.delete(socket);
                    });
                    log.info('Connections closed');
                    resolve();
                }, timeout);
                let clear = () => {
                    clearTimeout(timer);
                    log.info('Connections drained');
                    resolve();
                };
                sockets.once('empty', clear);
            }
        });
    }

    // Graceful shutdown
    async close () {
        let { log, shutdownHandlers, promise } = this;
        log.info('Closing listen socket');
        this.stop();
        log.info('Executing shutdown handlers');
        await each(shutdownHandlers, async handler => {
            try {
                await (isFunction(handler) ? handler(this) : handler);
            } catch (err) {
                log.error(new ServerError(err, 'Shutdown handler failed'));
            }
        });
        log.info('Draining connections');
        await this.drain();
        log.info('Shutdown complete');
        promise.listen?.resolve();
    }

    address () {
        let { socket, family, port, opts: { bind }} = this;
        if (!socket) {
            return null;
        }
        return { address: bind, family, port };
    }

    errorResponse (err, { msg='Unknown Error', status=500 }={}) {
        if (err?.getResponse) {
            return err.getResponse();
        }
        let { showError, showStack } = this.opts;
        if (!(err instanceof Error)) {
            err = new Error(`Unknown Error: ${err}`, { cause: err });
        }
        if (showStack) {
            msg = `${msg}: ${err.stack}`;
        } else if (showError) {
            msg = `${msg}: ${err}`;
        }
        return new Response(msg, { status: err.status || status });
    }

    error (err, socket, { msg='Server Error', status=500 }={}) {
        this.respond(this.errorResponse(err, { msg, status }), socket);
    }

    clientError (err, socket, opts) {
        this.error(err, socket, { msg: 'Client Error', status: 400, ...opts });
    }

    serverError (err, socket, opts) {
        this.error(err, socket, { msg: 'Server Error', status: 500, ...opts });
    }

    // Handles multiple response body types directly
    // Serializes JSON types (except null)
    // Supports ReadableStreams, TypedArrays, Blobs, Files, and Promises
    // Note: uWS sets content-length automatically
    async respond (res, socket) {

        if (socket.aborted || socket.done) {
            return;
        }

        if (res[SYMBOLS.res]) {
            res = res[SYMBOLS.res];
        }

        let buf, { body, headers, status, statusText } = res;

        let type = getType(body);

        if (type === TYPES.Promise) {
            type = getType(body = await body);
        }

        let cat = BODY_TYPES.get(type) ?? BODY.unknown;

        switch (cat) {
            case BODY.string:
                buf = strToUint8Array(body);
                break;
            case BODY.blob:
                buf = new Uint8Array(await body.arrayBuffer());
                break;
            case BODY.file:
                cat = BODY.stream;
                body = body.stream();
                break;
            // Note: Hono uses null to signify an empty response
            case BODY.empty:
            // Web streams
            case BODY.stream:
                break;
            case BODY.transform:
                cat = BODY.stream;
                body = body.readable;
                break;
            // Node streams
            case BODY.readable:
                cat = BODY.stream;
                body = Readable.toWeb(body);
                break;
            // JSON types
            case BODY.json:
                headers.set('content-type', 'application/json');
                buf = strToUint8Array(JSON.stringify(body));
                break;
            // Note: Multi-byte views are normalized to byte views, the
            // write retry offset is in bytes
            case BODY.view:
                buf = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
                break;
            case BODY.arraybuffer:
                buf = new Uint8Array(body);
                break;
            // uWS supported types
            case BODY.bytes:
                buf = body;
                break;
            default:
                // Uint8ClampedArray
                // Float16Array
                // BigUint64Array
                // BigInt64Array
                if (isTypedArray(body)) {
                    buf = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
                }
                break;
        }

        if (body && !headers.has('content-type')) {
            headers.set('content-type', 'text/plain; charset=utf-8');
        }

        // Note: Socket may have aborted while a body was awaited
        if (socket.aborted || socket.done) {
            return;
        }

        // Note: Corking signals uWS to collect writes for batching into one syscall
        // Synchronus code inside a uWS callback is already corked, but anything
        // async needs to be corked again before each write
        // https://unetworking.github.io/uWebSockets.js/generated/interfaces/HttpResponse.html#cork
        // https://github.com/uNetworking/uWebSockets.js/discussions/909#discussioncomment-6020785
        // https://github.com/uNetworking/uWebSockets/blob/master/misc/READMORE.md#corking
        socket.cork(() => {

            if (statusText) {
                socket.writeStatus(`${status} ${statusText}`);
            } else {
                socket.writeStatus(`${status}`);
            }

            if (headers) {
                for (const [key, val] of headers) {
                    socket.writeHeader(key, val);
                }
            }

            // Note: Set when a large unread body remains
            // Client closes the connection instead of reusing a wedged one
            if (socket.shouldClose && !headers?.has('connection')) {
                socket.writeHeader('connection', 'close');
            }

            if (buf) {
                let len = buf.byteLength;
                // Note: Synchronous code inside uWS callback, already corked
                // Note: The onWritable offset is absolute for the whole response,
                // always slice from the original buffer
                const write = offset => {
                    if (socket.aborted || socket.done) {
                        return true;
                    }
                    let [ok, done] = socket.tryEnd(offset ? buf.subarray(offset) : buf, len);
                    if (done) {
                        socket.done = true;
                        this.sockets.delete(socket);
                        return true;
                    }
                    if (!ok) {
                        socket.onWritable(write);
                    }
                    return ok;
                }
                write(0);
            } else {
                switch (cat) {
                    case BODY.empty:
                        // Note: Already corked
                        if (headers.has('content-length')) {
                            socket.endWithoutBody();
                        } else {
                            socket.endWithoutBody(0);
                        }
                        socket.done = true;
                        this.sockets.delete(socket);
                        break;
                    case BODY.stream:
                        if (body.locked) {
                            throw new ResponseError('Response body ReadableStream locked');
                        }
                        let reader = body.getReader();
                        // Note: Cancel reader if the client aborts while a read is pending
                        socket.onAbort = () => {
                            reader.cancel().catch(noop);
                        };
                        // Note: Chunked encoding mode
                        // Note: Asynchronous code, needs to be corked on every write
                        const write = async () => {
                            let done, value;
                            try {
                                ({ done, value } = await reader.read());
                            } catch (err) {
                                // Note: Headers are already sent, terminating the
                                // connection is the only error signal left
                                this.log.error(new ResponseError(err, 'Response body stream failed'));
                                if (!socket.aborted && !socket.done) {
                                    socket.done = true;
                                    socket.close();
                                }
                                this.sockets.delete(socket);
                                return;
                            }
                            if (socket.aborted || socket.done) {
                                reader.cancel().catch(noop);
                                return;
                            }
                            socket.cork(() => {
                                if (done) {
                                    socket.endWithoutBody();
                                    socket.done = true;
                                    socket.onAbort = null;
                                    this.sockets.delete(socket);
                                } else {
                                    if (socket.write(value)) {
                                        write();
                                    } else {
                                        socket.onWritable(() => {
                                            write();
                                            return true;
                                        });
                                    }
                                }
                            });
                        }
                        write();
                        break;
                    default:
                        throw new ResponseError('Response body type not supported: %s', type.name);
                }
            }

        });

    }

    static factory (defs) {
        const Fn = this;
        return function factory (opts, fn) {
            return new Fn(opts, fn, defs);
        }
    }

}

export const Server = uWSServer.factory();

export function serve (opts, fn) {
    return new uWSServer(opts, fn).listen();
}
