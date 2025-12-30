import { defaults, each, getType, ipFamily, isFunction, isTypedArray, toArray, toFn, TYPES } from 'lo';
import process from 'node:process';
import { APP_METHODS as METHODS, SYM } from './constants.js';
import './globals.js';
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
    createServer: undefined,
    server: undefined,
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

export class uWSServer {

    constructor (opts, fn) {

        this.opts = opts = defaults(opts, defs);

        let {
            fetch,
            bind,
            port,
            defaultHost,
            ssl,
            http3,
            createServer,
            server,
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

        let scheme = getScheme(ssl);
        let sockets = new Sockets();

        createServer = toFn(createServer, uWSServer.createServer);

        this.app = createServer({ ...server, http3, ssl, uws });
        this.uws = uws;
        this.socket = null;
        this.port = null;
        this.family = ipFamily(bind);
        this.scheme = scheme;
        this.sockets = sockets;
        this.shutdownHandlers = new Set(toArray(shutdown));
        this.log = log ||= console;
        this.exited = false;

        this.register('ANY', '/*', async (socket, httpReq) => {
            let req, res;
            try {
                socket.onAborted(() => {
                    socket.aborted = true;
                    if (req) {
                        req[SYM.state].ac.abort();
                    }
                    sockets.delete(socket);
                });
                sockets.add(socket);
                try {
                    req = new uWSRequest(socket, httpReq, { defaultHost, scheme });
                } catch (err) {
                    return this.handleClientError(err, socket);
                }
                try {
                    res = await fetch(req, { socket, httpReq, server: this });
                } catch (err) {
                    return this.handleServerError(err, socket);
                }
                this.handleResponse(res, socket);
            } catch (err) {
                this.handleError(err, socket);
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

        if (listen || fn) {
            this.listen(fn);
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

    }

    // Accepts function or promise
    addShutdownHandler (handler) {
        if (handler) {
            this.shutdownHandlers.add(handler);
        }
    }

    register (method='GET', route, fn) {
        if (!METHODS[method]) {
            throw new ServerError('Method not supported: %s', method);
        }
        this.app[METHODS[method]](route, fn);
    }

    listen (fn) {
        let { socket, app, opts, uws, log } = this;
        if (!socket) {
            app.listen(opts.bind, opts.port, socket => {
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
        let { socket, uws } = this;
        if (socket) {
            uws.us_listen_socket_close(socket);
            this.socket = null;
        }
    }

    exit (code=0) {
        if (!this.exited) {
            this.exited = true;
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
            let { log, opts, sockets } = this;
            if (!sockets.size) {
                log.info('Connections empty');
                resolve();
            } else {
                log.info('Waiting: %d ms for: %d connections to drain', opts.timeout, sockets.size);
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
                }, opts.timeout);
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
        log.info('Executing graceful shutdown handlers');
        await each(shutdownHandlers, async handler => {
            try {
                await (isFunction(handler) ? handler(this) : handler);
            } catch (err) {
                log.error('Graceful shutdown handler failed: %s', err);
            }
        });
        log.info('Draining connections');
        await this.drain();
        log.info('Shutdown complete');
    }

    address () {
        let { socket, opts, family, port } = this;
        if (!socket) {
            return null;
        }
        return { address: opts.bind, family, port };
    }

    responseFromError (err, { msg='Unknown Error', status=500 }={}) {
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

    handleError (err, socket, { msg='Server Error', status=500 }={}) {
        this.handleResponse(this.responseFromError(err, { msg, status }), socket);
    }

    handleClientError (err, socket, opts) {
        this.handleError(err, socket, { msg: 'Client Error', status: 400, ...opts });
    }

    handleServerError (err, socket, opts) {
        this.handleError(err, socket, { msg: 'Server Error', status: 500, ...opts });
    }

    // Handles multiple response body types directly
    // Serializes JSON types
    // Supports ReadableStreams, TypedArrays, Blobs, Files, and Promises
    async handleResponse (res, socket) {

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
                buf = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
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
                const write = (buf, len, offset) => {
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
                    case TYPES.Undefined:
                        socket.end();
                        socket.done = true;
                        this.sockets.delete(socket);
                        break;
                    case TYPES.ReadableStream:
                        if (socket.aborted) {
                            return;
                        }
                        if (body.locked) {
                            throw new ResponseError('Response body ReadableStream locked');
                        }
                        // Note: Chunked encoding mode
                        let reader = body.getReader();
                        const write = async () => {
                            let { done, value } = await reader.read();
                            if (done) {
                                socket.end();
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
                        }
                        write();
                        break;
                    default:
                        throw new ResponseError('Response body type not supported: %s', type.name);
                }
            }

        });

    }

    static createServer ({ http3, ssl, uws, ...opts }={}) {
        if (!uws) {
            throw new ServerError('uWebSockets default export required');
        }
        if (http3) {
            return uws.H3App(opts);
        }
        if (ssl) {
            return uws.SSLApp(opts);
        }
        return uws.App(opts);
    }

    static factory (defs) {
        return function factory (opts, fn) {
            return new uWSServer({ ...defs, ...opts }, fn);
        }
    }

}

export const Server = uWSServer.factory();

export async function serve (opts={}, fn) {
    opts.uws ||= await uWSImport();
    return new uWSServer({ listen: true, ...opts }, fn);
}
