import { defaults, ipFamily, noop, toFn } from 'lo';
import { APP_METHODS as METHODS } from './constants.js';
import './globals.js';
import { handleError, handleResponse } from './handle.js';
import { Request, UWSRequest } from './request.js';
import { UWSResponse } from './response.js';
import { ServerError, clientErrorResponse, getScheme, serverErrorResponse } from './util.js';

const defs = {
    fetch: undefined,
    bind: '::',
    port: undefined,
    host: undefined,
    ssl: false,
    http3: false,
    createServer: undefined,
    server: undefined,
    uws: undefined,
    globals: true,
    showError: true,
    showStack: false
};

export class UWSServer {

    constructor (opts, fn) {

        this.opts = opts = defaults(opts, defs);

        let { fetch, bind, port, host: defaultHost, ssl, http3, createServer, server, uws, globals, showError, showStack } = opts;
        let scheme = getScheme(ssl);

        createServer = toFn(createServer, UWSServer.createServer);

        if (!fetch) {
            throw new ServerError('Fetch required');
        }

        this.app = createServer(server, ssl, http3, uws);
        this.socket = null;
        this.port = null;
        this.family = ipFamily(bind);
        this.scheme = scheme;

        this.register('ANY', '/*', async (outgoing, incoming) => {
            let req, res;
            try {

                req = new UWSRequest(incoming, outgoing, { defaultHost, scheme });
                res = await fetch(req, { incoming, outgoing, server: this });
                handleResponse(res, outgoing);
            } catch (err) {
                if (!res) {
                    if (!req) {
                        res = clientErrorResponse(err, { showError, showStack });
                    } else {
                        res = serverErrorResponse(err, { showError, showStack });
                    }
                    try {
                        handleResponse(res, outgoing);
                    } catch (err) {
                        handleError(err, outgoing, { showError, showStack });
                    }
                } else {
                    handleError(err, outgoing, { showError, showStack });
                }
            }
        });

        if (globals) {
            if (globalThis.Request !== Request) {
                Object.defineProperty(globalThis, 'Request', {
                    value: Request
                });
            }
            if (globalThis.Response !== UWSResponse) {
                Object.defineProperty(globalThis, 'Response', {
                    value: UWSResponse
                });
            }
        }

        if (fn) {
            this.listen(fn);
        }

    }

    register (method='GET', route, fn) {
        if (!METHODS[method]) {
            throw new ServerError('Method not supported: %s', method);
        }
        this.app[METHODS[method]](route, fn);
    }

    listen (fn) {
        if (!this.socket) {
            let { bind, port, uws } = this.opts;
            this.app.listen(bind, port, socket => {
                if (socket) {
                    this.socket = socket;
                    this.port = uws.us_socket_local_port(socket);
                    if (fn) {
                        fn(this.address(), this);
                    }
                } else {
                    throw new ServerError('Server failed to listen');
                }
            });
        } else {
            throw new ServerError('Server already listening');
        }
    }

    address () {
        let { socket, port, family } = this;
        if (!socket) {
            return null;
        }
        return { address: this.opts.bind, port, family };
    }

    static createServer (opts={}, ssl, http3, uws) {
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

}

export async function UWSImport () {
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

export async function serve (opts={}, fn=noop) {
    opts.uws ||= await UWSImport();
    return new UWSServer(opts, fn);
}
