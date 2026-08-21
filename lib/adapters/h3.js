import { SYMBOLS } from '../constants.js';
import { serve, Server, uWSServer } from '../server.js';
import { ServeStatic as BaseStatic } from '../static.js';
import { createConninfo } from '../util.js';

// H3 doesn't pass env to event
// Note: Socket is read from request state instead
export const conninfo = createConninfo(e => e.req[SYMBOLS.state].socket);

// Targets h3 v2 web contexts (event.req, event.res, event.url)
// Note: Handlers return the response body directly
// Note: Status and headers are set on event.res
export class H3Static extends BaseStatic {

    finalized (e) {
        return !!e.handled;
    }

    path (e) {
        return e.url.pathname;
    }

    method (e) {
        return e.req.method;
    }

    header (e, name) {
        return e.req.headers.get(name) ?? undefined;
    }

    set (e, name, val) {
        e.res.headers.set(name, String(val));
    }

    send (e, body, status=200, headers) {
        if (headers) {
            for (let [key, val] of Object.entries(headers)) {
                e.res.headers.set(key, String(val));
            }
        }
        e.res.status = status;
        return body;
    }

}

export function serveStatic (...args) {
    return new H3Static(...args).middleware();
}

export {
    serve,
    Server,
    H3Static as ServeStatic,
    uWSServer
};

export default serve;
