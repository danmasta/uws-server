import { SYMBOLS } from '../constants.js';
import { serve, Server, uWSServer } from '../server.js';
import { ServeStatic as BaseStatic } from '../static.js';
import { createConninfo } from '../util.js';

// Elysia doesn't pass env to context
// Note: Socket is read from request state instead
export const conninfo = createConninfo(c => c.request[SYMBOLS.state].socket);

// Handlers return the response body directly
// Note: Status and headers are set via c.set
export class ElysiaStatic extends BaseStatic {

    finalized (c) {
        return c.response != null;
    }

    path (c) {
        return c.path;
    }

    method (c) {
        return c.request.method;
    }

    header (c, name) {
        return c.headers[name];
    }

    set (c, name, val) {
        c.set.headers[name] = String(val);
    }

    send (c, body, status=200, headers) {
        if (headers) {
            Object.assign(c.set.headers, headers);
        }
        c.set.status = status;
        return body;
    }

}

export function serveStatic (...args) {
    return new ElysiaStatic(...args).middleware();
}

export {
    serve,
    Server,
    ElysiaStatic as ServeStatic,
    uWSServer
};

export default serve;
