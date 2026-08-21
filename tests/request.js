import { rejects } from 'node:assert';
import { SYMBOLS } from '../lib/constants.js';
import { Request, uWSRequest } from '../lib/request.js';

const encoder = new TextEncoder();

function mockReq (method='post', headers={}) {
    headers = { host: 'localhost:8080', ...headers };
    return {
        getMethod: () => method,
        getUrl: () => '/test',
        getQuery: () => 'a=1',
        getHeader: name => headers[name] ?? '',
        forEach: fn => fn('host', 'localhost:8080')
    };
}

function mockSocket () {
    return {
        paused: false,
        aborted: false,
        done: false,
        dataCb: null,
        pause () { this.paused = true; },
        resume () { this.paused = false; },
        onData (cb) { this.dataCb = cb; }
    };
}

function tick () {
    return new Promise(res => setImmediate(res));
}

describe('request', () => {

    it('should register onData eagerly and pause until body is read', async () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post'), socket);
        assert.isFunction(socket.dataCb);
        assert.isTrue(socket.paused);

        // Chunk arrives before anything accesses the body
        socket.dataCb(encoder.encode('hello ').buffer, false);
        assert.isTrue(socket.paused);

        let p = req.text();
        await tick();
        assert.isFalse(socket.paused);

        socket.dataCb(encoder.encode('world!').buffer, true);
        assert.equal(await p, 'hello world!');
    });

    it('should copy chunk memory before enqueue', async () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post'), socket);

        // Reuse the same backing buffer for each chunk like uWS
        let buf = new ArrayBuffer(6);
        let view = new Uint8Array(buf);
        view.set(encoder.encode('hello '));
        socket.dataCb(buf, false);
        view.set(encoder.encode('world!'));
        socket.dataCb(buf, true);
        view.fill(0);

        assert.equal(await req.text(), 'hello world!');
    });

    it('should resume the socket once the body has fully arrived', async () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('put'), socket);
        socket.dataCb(encoder.encode('early').buffer, true);
        assert.isFalse(socket.paused);
        assert.equal(await req.text(), 'early');
    });

    it('should defer Headers construction until accessed', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('get'), socket);
        assert.isArray(req[SYMBOLS.state].headers);
        assert.instanceOf(req.headers, Headers);
        assert.equal(req.headers.get('host'), 'localhost:8080');
        assert.instanceOf(req[SYMBOLS.state].headers, Headers);
    });

    it('should defer AbortController creation until the signal is used', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('get'), socket);
        req.method;
        req.url;
        req.headers;
        assert.isNull(req[SYMBOLS.state].ac);
        assert.instanceOf(req.signal, AbortSignal);
        assert.isNotNull(req[SYMBOLS.state].ac);
        assert.isFalse(req.signal.aborted);
    });

    it('should create a pre-aborted signal after abort', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('get'), socket);
        req.abort();
        assert.isNull(req[SYMBOLS.state].ac);
        assert.isTrue(req.signal.aborted);
    });

    it('should not register onData or create a body for GET', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('get'), socket);
        assert.isNull(socket.dataCb);
        assert.isFalse(socket.paused);
        assert.isNull(req.body);
        assert.equal(req.method, 'GET');
    });

    it('should error the body stream on abort mid-body', async () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post'), socket);
        let p = req.text();
        socket.dataCb(encoder.encode('partial').buffer, false);
        socket.aborted = true;
        req.abort();
        await rejects(p, /abort/i);
    });

    it('should error the body stream on abort before body access', async () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post'), socket);
        socket.aborted = true;
        req.abort();
        await rejects(req.text(), /abort/i);
    });

    it('should pause the socket and ignore chunks after cancel', async () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post'), socket);
        let reader = req.body.getReader();
        await reader.cancel();
        assert.isTrue(socket.paused);
        assert.doesNotThrow(() => {
            socket.dataCb(encoder.encode('late').buffer, true);
        });
    });

    it('should drain a small unread body remainder on discard', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post', { 'content-length': '10' }), socket);
        socket.dataCb(encoder.encode('unread').buffer, false);
        assert.isTrue(socket.paused);
        req.discard();
        assert.isFalse(socket.paused);
        assert.notOk(socket.shouldClose);
        assert.lengthOf(req[SYMBOLS.state].body.queue, 0);
        assert.doesNotThrow(() => {
            socket.dataCb(encoder.encode('late').buffer, true);
        });
        // No-op when there is no body
        let req2 = new uWSRequest(mockReq('get'), mockSocket());
        assert.doesNotThrow(() => req2.discard());
    });

    it('should signal connection close when a large remainder is unread', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post', { 'content-length': '100000' }), socket);
        socket.dataCb(encoder.encode('unread').buffer, false);
        req.discard();
        assert.isTrue(socket.paused);
        assert.isTrue(socket.shouldClose);
    });

    it('should signal connection close when the remainder is unknown', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post'), socket);
        socket.dataCb(encoder.encode('unread').buffer, false);
        req.discard();
        assert.isTrue(socket.paused);
        assert.isTrue(socket.shouldClose);
    });

    it('should not signal connection close when the body fully arrived', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post'), socket);
        socket.dataCb(encoder.encode('done').buffer, true);
        req.discard();
        assert.isFalse(socket.paused);
        assert.notOk(socket.shouldClose);
    });

    it('should support the forbidden methods TRACE and CONNECT', () => {
        for (let method of ['trace', 'connect']) {
            let socket = mockSocket();
            let req = new uWSRequest(mockReq(method), socket);
            assert.isNull(socket.dataCb);
            assert.equal(req.request.method, method.toUpperCase());
        }
    });

    it('should unwrap a uWSRequest passed to the Request constructor', () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('get'), socket);
        let native = new Request(req);
        assert.equal(native.url, 'http://localhost:8080/test?a=1');
        assert.instanceOf(req, Request);
    });

    it('should apply backpressure at the high water mark', async () => {
        let socket = mockSocket();
        let req = new uWSRequest(mockReq('post'), socket);
        assert.isTrue(socket.paused);

        let reader = req.body.getReader();
        await tick();
        assert.isFalse(socket.paused);

        let chunk = encoder.encode('x').buffer;
        for (let i = 0; i < 40 && !socket.paused; i++) {
            socket.dataCb(chunk, false);
        }
        assert.isTrue(socket.paused);

        await reader.read();
        assert.isFalse(socket.paused);
    });

});
