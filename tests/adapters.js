import * as elysia from '../lib/adapters/elysia.js';
import * as h3 from '../lib/adapters/h3.js';
import * as hono from '../lib/adapters/hono.js';
import { SYMBOLS } from '../lib/constants.js';
import { serve, uWSServer } from '../lib/server.js';
import { ServeStatic } from '../lib/static.js';

const socket = {
    getRemoteAddress: () => new Uint8Array([127, 0, 0, 1]).buffer,
    getRemotePort: () => 1234
};

describe('adapters', () => {

    describe('hono', () => {

        it('should re-export core and subclass the base', () => {
            assert.isTrue(hono.ServeStatic.prototype instanceof ServeStatic);
            assert.equal(hono.uWSServer, uWSServer);
            assert.equal(hono.default, serve);
            assert.isFunction(hono.serveStatic);
        });

        it('should read the socket from c.env', () => {
            let info = hono.conninfo({ env: { socket } });
            assert.deepEqual(info, { address: '127.0.0.1', port: 1234, family: 'ipv4' });
        });

    });

    describe('elysia', () => {

        it('should read the socket from the request state', () => {
            let c = { request: { [SYMBOLS.state]: { socket } } };
            let info = elysia.conninfo(c);
            assert.equal(info.address, '127.0.0.1');
            assert.equal(info.port, 1234);
        });

        it('should map context accessors', () => {
            let st = new elysia.ServeStatic('.');
            let c = {
                path: '/a.txt',
                request: { method: 'GET' },
                headers: { range: 'bytes=0-4' },
                set: { headers: {}, status: undefined },
                response: undefined
            };
            assert.isFalse(st.finalized(c));
            assert.equal(st.path(c), '/a.txt');
            assert.equal(st.method(c), 'GET');
            assert.equal(st.header(c, 'range'), 'bytes=0-4');
            st.set(c, 'x-a', 1);
            assert.equal(c.set.headers['x-a'], '1');
            let body = st.send(c, 'hello', 206, { allow: 'GET' });
            assert.equal(body, 'hello');
            assert.equal(c.set.status, 206);
            assert.equal(c.set.headers.allow, 'GET');
            c.response = {};
            assert.isTrue(st.finalized(c));
        });

    });

    describe('h3', () => {

        it('should read the socket from the request state', () => {
            let e = { req: { [SYMBOLS.state]: { socket } } };
            let info = h3.conninfo(e);
            assert.equal(info.address, '127.0.0.1');
            assert.equal(info.port, 1234);
        });

        it('should map context accessors', () => {
            let st = new h3.ServeStatic('.');
            let e = {
                handled: false,
                url: new URL('http://localhost/a.txt'),
                req: new globalThis.Request('http://localhost/a.txt', {
                    headers: { range: 'bytes=0-4' }
                }),
                res: { status: undefined, headers: new Headers() }
            };
            assert.isFalse(st.finalized(e));
            assert.equal(st.path(e), '/a.txt');
            assert.equal(st.method(e), 'GET');
            assert.equal(st.header(e, 'range'), 'bytes=0-4');
            assert.isUndefined(st.header(e, 'missing'));
            st.set(e, 'x-a', 1);
            assert.equal(e.res.headers.get('x-a'), '1');
            let body = st.send(e, 'hello', 206, { allow: 'GET' });
            assert.equal(body, 'hello');
            assert.equal(e.res.status, 206);
            assert.equal(e.res.headers.get('allow'), 'GET');
            e.handled = true;
            assert.isTrue(st.finalized(e));
        });

    });

});
