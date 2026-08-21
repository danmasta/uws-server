import { serve, Server, uWSServer } from '../server.js';
import { ServeStatic as BaseStatic } from '../static.js';
import { createConninfo } from '../util.js';

// Socket is passed to fetch as env (hono exposes it on c.env)
export const conninfo = createConninfo(c => c.env.socket);

// Hono style context
// Note: Handlers respond via c.body
export class HonoStatic extends BaseStatic {

    finalized (c) {
        return c.finalized;
    }

    path (c) {
        return c.req.path;
    }

    method (c) {
        return c.req.method;
    }

    header (c, name) {
        return c.req.header(name);
    }

    set (c, name, val) {
        c.header(name, val);
    }

    send (c, body, status, headers) {
        return c.body(body, status, headers);
    }

}

export function serveStatic (...args) {
    return new HonoStatic(...args).middleware();
}

export {
    serve,
    Server,
    HonoStatic as ServeStatic,
    uWSServer
};

export default serve;
