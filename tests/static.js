import { rejects } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buffer, text } from 'node:stream/consumers';
import { gunzipSync } from 'node:zlib';
import { ServeStatic } from '../lib/adapters/hono.js';
import { SYMBOLS } from '../lib/constants.js';
import { uWSResponse } from '../lib/response.js';
import { ServeStatic as FetchStatic } from '../lib/static.js';

let tmp, dir;

// Mock context object
function context (path, { method='GET', headers={} }={}) {
    let res = {
        status: undefined,
        body: undefined,
        headers: new Map()
    };
    let c = {
        res,
        finalized: false,
        req: {
            path,
            method,
            header: name => headers[name]
        },
        header (name, val) {
            res.headers.set(name, String(val));
        },
        body (body, status=200, headers) {
            if (headers) {
                for (let [key, val] of Object.entries(headers)) {
                    res.headers.set(key, String(val));
                }
            }
            res.status = status;
            res.body = body;
            c.finalized = true;
            return res;
        }
    };
    return c;
}

async function request (path, { opts, ...init }={}) {
    let c = context(path, init);
    c.nextCalled = false;
    await new ServeStatic(dir, opts).middleware()(c, () => {
        c.nextCalled = true;
    });
    return c;
}

// Read a response body of any shape
async function read (body) {
    if (body == null) {
        return body;
    }
    if (body instanceof Uint8Array) {
        return Buffer.from(body).toString();
    }
    return text(body);
}

describe('static', () => {

    before(async () => {
        tmp = await mkdtemp(join(tmpdir(), 'uws-static-'));
        dir = join(tmp, 'root');
        await mkdir(join(dir, 'sub'), { recursive: true });
        await writeFile(join(tmp, 'secret.txt'), 'PARENT SECRET');
        await writeFile(join(dir, 'hello.txt'), '0123456789');
        await writeFile(join(dir, 'app.js'), 'console.log("hello world");'.repeat(4));
        await writeFile(join(dir, 'LICENSE'), 'license text');
        await writeFile(join(dir, 'sub', 'index.html'), '<html></html>');
    });

    after(async () => {
        await rm(tmp, { recursive: true, force: true });
    });

    it('should serve a file with headers', async () => {
        let { res } = await request('/hello.txt');
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
        assert.include(res.headers.get('cache-control'), 'public');
        assert.equal(res.headers.get('accept-ranges'), 'bytes');
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.isString(res.headers.get('last-modified'));
        assert.equal(await read(res.body), '0123456789');
    });

    it('should serve extensionless files as octet-stream', async () => {
        let { res } = await request('/LICENSE', { headers: { 'accept-encoding': 'gzip' } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'application/octet-stream');
        assert.isFalse(res.headers.has('vary'));
        assert.isFalse(res.headers.has('content-encoding'));
        assert.equal(await read(res.body), 'license text');
    });

    it('should return 404 for bad percent encoding', async () => {
        let { res } = await request('/%');
        assert.equal(res.status, 404);
    });

    it('should return 404 for traversal paths', async () => {
        assert.equal((await request('/../secret.txt')).res.status, 404);
        assert.equal((await request('/%2e%2e/secret.txt')).res.status, 404);
        assert.equal((await request('/..%2Fsecret.txt')).res.status, 404);
    });

    it('should return 404 for missing files and directories', async () => {
        assert.equal((await request('/missing.txt')).res.status, 404);
        assert.equal((await request('/sub')).res.status, 404);
    });

    it('should serve index files for directories', async () => {
        let { res } = await request('/sub', { opts: { index: true } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
        assert.equal(await read(res.body), '<html></html>');
    });

    it('should serve ranges', async () => {
        let { res } = await request('/hello.txt', { headers: { range: 'bytes=0-4' } });
        assert.equal(res.status, 206);
        assert.equal(res.headers.get('content-range'), 'bytes 0-4/10');
        assert.equal(res.headers.get('content-length'), '5');
        assert.equal(await read(res.body), '01234');
    });

    it('should serve suffix and open ended ranges', async () => {
        let { res } = await request('/hello.txt', { headers: { range: 'bytes=-3' } });
        assert.equal(res.status, 206);
        assert.equal(res.headers.get('content-range'), 'bytes 7-9/10');
        assert.equal(await read(res.body), '789');

        ({ res } = await request('/hello.txt', { headers: { range: 'bytes=5-' } }));
        assert.equal(res.status, 206);
        assert.equal(res.headers.get('content-range'), 'bytes 5-9/10');
        assert.equal(await read(res.body), '56789');
    });

    it('should clamp ranges to file size', async () => {
        let { res } = await request('/hello.txt', { headers: { range: 'bytes=0-9999' } });
        assert.equal(res.status, 206);
        assert.equal(res.headers.get('content-range'), 'bytes 0-9/10');
        assert.equal(res.headers.get('content-length'), '10');
        assert.equal(await read(res.body), '0123456789');
    });

    it('should ignore invalid ranges', async () => {
        let { res } = await request('/hello.txt', { headers: { range: 'bytes=5-2' } });
        assert.equal(res.status, 200);
        assert.isFalse(res.headers.has('content-range'));
        assert.equal(await read(res.body), '0123456789');
    });

    it('should return 416 for unsatisfiable ranges', async () => {
        let { res } = await request('/hello.txt', { headers: { range: 'bytes=999-' } });
        assert.equal(res.status, 416);
        assert.equal(res.headers.get('content-range'), 'bytes */10');
        assert.isNull(res.body);
    });

    it('should not compress range responses', async () => {
        let { res } = await request('/app.js', {
            headers: { range: 'bytes=0-6', 'accept-encoding': 'gzip' }
        });
        assert.equal(res.status, 206);
        assert.equal(res.headers.get('vary'), 'accept-encoding');
        assert.isFalse(res.headers.has('content-encoding'));
        assert.equal(await read(res.body), 'console');
    });

    it('should compress with accepted encodings', async () => {
        let { res } = await request('/app.js', { headers: { 'accept-encoding': 'gzip' } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-encoding'), 'gzip');
        assert.equal(res.headers.get('vary'), 'accept-encoding');
        let buf = await buffer(res.body);
        assert.equal(gunzipSync(buf).toString(), 'console.log("hello world");'.repeat(4));
    });

    it('should set content-length for head requests', async () => {
        let { res } = await request('/hello.txt', { method: 'HEAD' });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-length'), '10');
        assert.isUndefined(res.body);
    });

    it('should omit content-length for encoded head requests', async () => {
        let { res } = await request('/app.js', { method: 'HEAD', headers: { 'accept-encoding': 'gzip' } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-encoding'), 'gzip');
        assert.isFalse(res.headers.has('content-length'));
    });

    it('should return 405 for unsupported methods', async () => {
        let { res } = await request('/hello.txt', { method: 'POST' });
        assert.equal(res.status, 405);
        assert.equal(res.headers.get('allow'), 'GET, HEAD, OPTIONS');
    });

    it('should support fallthrough and custom notFound', async () => {
        let c = await request('/missing.txt', { opts: { fallthrough: true } });
        assert.isTrue(c.nextCalled);
        assert.isUndefined(c.res.status);

        let { res } = await request('/missing.txt', {
            opts: { notFound: (c, path) => c.body('nope', 404) }
        });
        assert.equal(res.status, 404);
        assert.equal(res.body, 'nope');
    });

    it('should call next when finalized', async () => {
        let c = context('/hello.txt');
        c.finalized = true;
        let called = false;
        await new ServeStatic(dir).middleware()(c, () => {
            called = true;
        });
        assert.isTrue(called);
    });

    it('should serve from cache until the file changes', async () => {
        await writeFile(join(dir, 'cache.txt'), 'cached body');
        let mw = new ServeStatic(dir, { cache: true }).middleware();
        let next = () => {};

        let c1 = context('/cache.txt');
        await mw(c1, next);
        assert.instanceOf(c1.res.body, Uint8Array);
        assert.equal(await read(c1.res.body), 'cached body');

        // Same buffer instance means it came from cache
        let c2 = context('/cache.txt');
        await mw(c2, next);
        assert.equal(c1.res.body, c2.res.body);

        await writeFile(join(dir, 'cache.txt'), 'changed');
        let c3 = context('/cache.txt');
        await mw(c3, next);
        assert.equal(await read(c3.res.body), 'changed');
    });

    it('should serve fetch requests with the generic adapter', async () => {
        let mw = new FetchStatic(dir).middleware();
        let res = await mw(new globalThis.Request('http://localhost/hello.txt'));
        assert.instanceOf(res, uWSResponse);
        // Response stays lazy until accessed
        assert.isUndefined(res[SYMBOLS.res]);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
        assert.equal(await res.text(), '0123456789');
    });

    it('should serve fetch range requests with the generic adapter', async () => {
        let mw = new FetchStatic(dir).middleware();
        let res = await mw(new globalThis.Request('http://localhost/hello.txt', {
            headers: { range: 'bytes=0-4' }
        }));
        assert.equal(res.status, 206);
        assert.equal(res.headers.get('content-range'), 'bytes 0-4/10');
        assert.equal(await res.text(), '01234');
    });

    it('should return 404 and support next for fetch requests', async () => {
        let mw = new FetchStatic(dir).middleware();
        let res = await mw(new globalThis.Request('http://localhost/missing.txt'));
        assert.equal(res.status, 404);

        mw = new FetchStatic(dir, { fallthrough: true }).middleware();
        assert.equal(await mw(new globalThis.Request('http://localhost/missing.txt'), () => 'fallback'), 'fallback');
    });

    it('should throw when the context shape does not match the adapter', async () => {
        let mw = new FetchStatic(dir).middleware();
        await rejects(mw(context('/hello.txt')), /Unknown request method/);
    });

    it('should prefer the request state path when set', async () => {
        let mw = new FetchStatic(dir).middleware();
        let req = new globalThis.Request('http://localhost/missing.txt');
        req[SYMBOLS.state] = { path: '/hello.txt' };
        let res = await mw(req);
        assert.equal(res.status, 200);
        assert.equal(await res.text(), '0123456789');
    });

    it('should support framework subclasses via context accessors', async () => {
        class TestStatic extends ServeStatic {
            finalized (e) { return e.done; }
            path (e) { return e.url; }
            method (e) { return e.verb; }
            header (e, name) { return e.reqHeaders[name]; }
            set (e, name, val) { e.resHeaders[name] = String(val); }
            send (e, body, status=200, headers) {
                Object.assign(e.resHeaders, headers);
                e.status = status;
                e.out = body;
                e.done = true;
            }
        }
        let e = {
            done: false,
            url: '/hello.txt',
            verb: 'GET',
            reqHeaders: { range: 'bytes=0-4' },
            resHeaders: {}
        };
        await new TestStatic(dir).middleware()(e, () => {});
        assert.equal(e.status, 206);
        assert.equal(e.resHeaders['content-range'], 'bytes 0-4/10');
        assert.equal(await read(e.out), '01234');
    });

});
