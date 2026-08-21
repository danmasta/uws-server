import { rejects } from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import { uWSServer } from '../lib/server.js';

const noop = () => {};
const log = { info: noop, warn: noop, error: noop };
const encoder = new TextEncoder();

describe('server', () => {

    let server, base;
    let streamCancelled = false;

    before(async () => {
        server = new uWSServer({
            port: 0,
            log,
            signals: false,
            handleUncaught: false,
            timeout: 100,
            fetch: async req => {
                let { pathname } = new URL(req.url);
                switch (pathname) {
                    case '/echo':
                        return new Response(await req.text());
                    // Waits before reading the body, data arrives while paused
                    case '/delay':
                        await delay(150);
                        return new Response(await req.text());
                    case '/json':
                        return Response.json(await req.json());
                    // Responds without reading the body
                    case '/ignore':
                        return new Response('ignored');
                    case '/stream':
                        return new Response(new ReadableStream({
                            async start (ctrl) {
                                for (let i = 0; i < 3; i++) {
                                    ctrl.enqueue(encoder.encode(`chunk${i}`));
                                    await delay(10);
                                }
                                ctrl.close();
                            }
                        }));
                    // Stream fails after the first chunk
                    case '/stream-error':
                        return new Response(new ReadableStream({
                            async pull (ctrl) {
                                ctrl.enqueue(encoder.encode('first'));
                                await delay(10);
                                ctrl.error(new Error('source failed'));
                            }
                        }));
                    // Slow infinite stream for client abort
                    case '/stream-slow':
                        return new Response(new ReadableStream({
                            async pull (ctrl) {
                                await delay(30);
                                ctrl.enqueue(encoder.encode('tick'));
                            },
                            cancel () {
                                streamCancelled = true;
                            }
                        }));
                    // Note: Multi-byte typed array (0x6261 is 'ab' little-endian)
                    case '/u16':
                        return new Response(new Uint16Array([0x6261, 0x6463]));
                    default:
                        return new Response(`${req.method} ${pathname}`);
                }
            }
        });
        await new Promise(res => server.listen(res));
        base = `http://localhost:${server.port}`;
    });

    after(async () => {
        await server.close();
    });

    it('should handle GET requests', async () => {
        let res = await fetch(`${base}/test`);
        assert.equal(res.status, 200);
        assert.equal(await res.text(), 'GET /test');
    });

    it('should not lose body data received before the body is read', async () => {
        let res = await fetch(`${base}/delay`, { method: 'POST', body: 'hello world' });
        assert.equal(await res.text(), 'hello world');
    });

    it('should stream large bodies intact', async () => {
        let body = 'x'.repeat(4 * 1024 * 1024) + 'END';
        let res = await fetch(`${base}/echo`, { method: 'POST', body });
        assert.equal(await res.text(), body);
    });

    it('should handle empty bodies', async () => {
        let res = await fetch(`${base}/echo`, { method: 'POST' });
        assert.equal(await res.text(), '');
    });

    it('should parse json bodies', async () => {
        let res = await fetch(`${base}/json`, {
            method: 'POST',
            body: JSON.stringify({ a: 1 }),
            headers: { 'content-type': 'application/json' }
        });
        assert.deepEqual(await res.json(), { a: 1 });
    });

    it('should respond without reading the body', async () => {
        let res = await fetch(`${base}/ignore`, { method: 'POST', body: 'small' });
        assert.equal(await res.text(), 'ignored');
        // Small remainder is drained, connection stays reusable
        assert.notEqual(res.headers.get('connection'), 'close');
        let res2 = await fetch(`${base}/echo`, { method: 'POST', body: 'reused' });
        assert.equal(await res2.text(), 'reused');
    });

    it('should close the connection when a large body is unread', async () => {
        let res = await fetch(`${base}/ignore`, { method: 'POST', body: 'x'.repeat(1024 * 1024) });
        assert.equal(await res.text(), 'ignored');
        assert.equal(res.headers.get('connection'), 'close');
        // Client reconnects instead of reusing the poisoned connection
        let res2 = await fetch(`${base}/echo`, { method: 'POST', body: 'still alive' });
        assert.equal(await res2.text(), 'still alive');
    });

    it('should stream response bodies', async () => {
        let res = await fetch(`${base}/stream`);
        assert.equal(await res.text(), 'chunk0chunk1chunk2');
    });

    it('should terminate the connection when a response stream fails', async () => {
        await rejects(fetch(`${base}/stream-error`).then(res => res.text()));
        let res = await fetch(`${base}/echo`, { method: 'POST', body: 'still alive' });
        assert.equal(await res.text(), 'still alive');
    });

    it('should cancel the response stream when the client aborts', async () => {
        streamCancelled = false;
        let ac = new AbortController();
        let p = fetch(`${base}/stream-slow`, { signal: ac.signal });
        await delay(100);
        ac.abort();
        await p.catch(noop);
        await delay(200);
        assert.isTrue(streamCancelled);
    });

    it('should send multi-byte typed array bodies as bytes', async () => {
        let res = await fetch(`${base}/u16`);
        assert.equal(await res.text(), 'abcd');
    });

    it('should retry partial writes from the correct offset', async () => {
        // Mock socket accepts 10 bytes per tryEnd call, onWritable reports
        // absolute offsets like uWS
        let socket = {
            aborted: false,
            done: false,
            offset: 0,
            written: [],
            writableCb: null,
            cork (fn) { fn(); },
            writeStatus: noop,
            writeHeader: noop,
            tryEnd (chunk, total) {
                let n = Math.min(chunk.byteLength, 10);
                this.written.push(Buffer.from(chunk.subarray(0, n)));
                this.offset += n;
                let ok = n === chunk.byteLength;
                let done = this.offset >= total;
                if (!ok && !done) {
                    setImmediate(() => this.writableCb(this.offset));
                }
                return [ok, done];
            },
            onWritable (cb) { this.writableCb = cb; }
        };
        let body = 'abcdefghijklmnopqrstuvwxyz0123456789';
        await server.respond({ body, headers: new Headers(), status: 200, statusText: '' }, socket);
        await delay(50);
        assert.equal(Buffer.concat(socket.written).toString(), body);
        assert.isTrue(socket.done);
    });

    it('should survive a client abort mid upload', async () => {
        let ac = new AbortController();
        let stream = new ReadableStream({
            async start (ctrl) {
                ctrl.enqueue(new TextEncoder().encode('part1'));
                await delay(50);
                ac.abort();
            }
        });
        await rejects(fetch(`${base}/delay`, {
            method: 'POST',
            body: stream,
            duplex: 'half',
            signal: ac.signal
        }), /abort/i);
        await delay(100);
        let res = await fetch(`${base}/echo`, { method: 'POST', body: 'still alive' });
        assert.equal(await res.text(), 'still alive');
    });

});
