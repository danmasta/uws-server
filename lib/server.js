import { defaults, each, getType, ipFamily, isFunction, isTypedArray, toArray, TYPES } from 'lo';
import process from 'node:process';
import { Readable } from 'node:stream';
import { METHODS_UWS as METHODS, SYM } from './constants.js';
import { Request, uWSRequest } from './request.js';
import { uWSResponse } from './response.js';
import { Sockets } from './sockets.js';
import { getScheme, ResponseError, ServerError, strToUint8Array, uWSImport } from './util.js';

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

function createServer (uws, http3, ssl, opts) {
    if (http3) {
        return uws.H3App(opts);
    }
    if (ssl) {
        return uws.SSLApp(opts);
    }
    return uws.App(opts);
}

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
            log,
            listen,
            signals,
            exitOnSignal,
            handleUncaught,
            exitOnUncaught,
            shutdown
        } = opts;

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
        this.promise = null;

        this.register(METHODS.any, '/*', async (socket, r) => {
            let req, res;
            socket.onAborted(() => {
                socket.aborted = true;
                if (req) {
                    req[SYM.state].ac.abort();
                }
                sockets.delete(socket);
            });
            sockets.add(socket);
            try {
                try {
                    req = new uWSRequest(r, socket, { defaultHost, scheme });
                } catch (err) {
                    return this.clientError(err, socket);
                }
                try {
                    res = await fetch(req, { r, socket, server });
                } catch (err) {
                    return this.serverError(err, socket);
                }
                this.respond(res, socket);
            } catch (err) {
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
                log.error('Uncaught exception: %s', err.stack);
                if (exitOnUncaught) {
                    await this.close();
                    this.exit(1);
                }
            });
            process.on('unhandledRejection', async err => {
                log.error('Unhandled promise rejection: %s', err.stack);
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

        if (this.promise) {
            return this.promise.promise;
        }

        this.promise = Promise.withResolvers();

        let uws = this.uws ||= await uWSImport();

        let { createServer, http3, ssl, app } = this.opts;

        this.app = createServer(uws, http3, ssl, app);

        each(this.handlers, ([method, route, fn]) => {
            this.app[METHODS[method]](route, fn);
        });

        this.promise.resolve();

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
        await this.init();
        let { uws, app, socket, log, opts: { bind, port }} = this;
        if (!socket) {
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
                    throw new ServerError('Server failed to listen');
                }
            });
        } else {
            log.warn('Server already listening');
        }
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
        let { log, shutdownHandlers } = this;
        log.info('Closing listen socket');
        this.stop();
        log.info('Executing shutdown handlers');
        await each(shutdownHandlers, async handler => {
            try {
                await (isFunction(handler) ? handler(this) : handler);
            } catch (err) {
                log.error('Shutdown handler failed: %s', err);
            }
        });
        log.info('Draining connections');
        await this.drain();
        log.info('Shutdown complete');
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

        if (res[SYM.response]) {
            res = res[SYM.response];
        }

        let buf, { body, headers, status, statusText } = res;

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
            // Note: Hono uses null to signify an empty response
            case TYPES.Null:
            case TYPES.Undefined:
                break;
            // Web streams
            case TYPES.ReadableStream:
                break;
            case TYPES.TransformStream:
            case TYPES.CompressionStream:
                type = TYPES.ReadableStream;
                body = body.readable;
                break;
            // Node streams
            case TYPES.Readable:
            case TYPES.ReadStream:
            case TYPES.Duplex:
            case TYPES.Transform:
            case TYPES.PassThrough:
                type = TYPES.ReadableStream;
                body = Readable.toWeb(body);
                break;
            // JSON types
            case TYPES.Number:
            case TYPES.Boolean:
            case TYPES.NaN:
            case TYPES.Infinity:
            case TYPES.Array:
            case TYPES.Object:
            case TYPES.Date:
                headers.set('content-type', 'application/json');
                buf = strToUint8Array(JSON.stringify(body));
                break;
            case TYPES.DataView:
                buf = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
                break;
            case TYPES.ArrayBuffer:
                buf = new Uint8Array(body);
                break;
            // uWS supported types
            case TYPES.Buffer:
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
                    buf = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
                }
                break;
        }

        if (body && !headers.has('content-type')) {
            headers.set('content-type', 'text/plain; charset=utf-8');
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

            if (buf) {
                // Note: Synchronous code inside uWS callback, already corked
                const write = (buf, len, offset) => {
                    if (socket.aborted || socket.done) {
                        return;
                    }
                    if (offset) {
                        buf = buf.subarray(offset);
                    }
                    let [ok, done] = socket.tryEnd(buf, len);
                    if (done) {
                        socket.done = true;
                        this.sockets.delete(socket);
                        return done;
                    }
                    if (!ok) {
                        socket.onWritable(offset => {
                            return write(buf, len, offset);
                        });
                    }
                    return ok;
                }
                write(buf, buf.byteLength, 0);
            } else {
                switch (type) {
                    case TYPES.Null:
                    case TYPES.Undefined:
                        // Note: Already corked
                        if (headers.has('content-length')) {
                            socket.endWithoutBody();
                        } else {
                            socket.endWithoutBody(0);
                        }
                        socket.done = true;
                        this.sockets.delete(socket);
                        break;
                    case TYPES.ReadableStream:
                        if (body.locked) {
                            throw new ResponseError('Response body ReadableStream locked');
                        }
                        let reader = body.getReader();
                        // Note: Chunked encoding mode
                        // Note: Asynchronous code, needs to be corked on every write
                        const write = async () => {
                            let { done, value } = await reader.read();
                            if (socket.aborted || socket.done) {
                                return;
                            }
                            socket.cork(() => {
                                if (done) {
                                    socket.endWithoutBody();
                                    socket.done = true;
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
    return new uWSServer(opts, fn, { listen: true });
}
