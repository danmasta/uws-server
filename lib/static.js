import { defaults, isArray, isNumeric, isObject, lru, resolve } from 'lo';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import { join, sep } from 'node:path';
import { cwd } from 'node:process';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { createBrotliCompress, createDeflate, createGzip, createZstdCompress } from 'node:zlib';
import { METHODS_HTTP as METHODS, REGEX, SYMBOLS } from './constants.js';
import { mimeFromPath } from './mime.js';
import { uWSResponse } from './response.js';
import { parseRange, ServeStaticError } from './util.js';

const defs = {
    cwd: cwd(),
    root: undefined,
    normalize: undefined,
    index: false,
    rewrite: undefined,
    alias: undefined,
    lastModified: true,
    nosniff: true,
    maxAge: 60 * 60 * 24 * 1, // 1 day (seconds)
    cacheControl: ['public'],
    immutable: false,
    etag: false, // (Not implemented)
    cache: false,
    max: 1024,
    maxSize: 1024 * 1024 * 1, // 1 MB (bytes)
    encodings: ['br', 'gzip', 'zstd', 'deflate'],
    range: true,
    fallthrough: false,
    found: undefined,
    notFound: undefined
};

// Handle serving static files
// Supports compression, ranges, and in-memory caching
export class ServeStatic {

    constructor (root, opts) {

        if (isObject(root)) {
            [root, opts] = [opts, root];
        }

        this.opts = opts = defaults({ root }, opts, defs);

        var { cwd, root, cache, max } = opts;

        let dir = resolve(root, cwd);

        if (!existsSync(dir)) {
            throw new ServeStaticError('Directory not found: %s', dir);
        }

        this.dir = dir;

        if (cache) {
            this.cache = lru({ max });
        }

    }

    // Context accessors (override per framework)
    // Note: Defaults target the web standard fetch shape
    // Note: Context is the incoming Request and send returns a lazy uWSResponse
    finalized (req) {
        return false;
    }

    path (req) {
        return req[SYMBOLS.state]?.path ?? new URL(req.url).pathname;
    }

    method (req) {
        return req.method;
    }

    header (req, name) {
        return req.headers.get(name) ?? undefined;
    }

    set (req, name, val) {
        (req[SYMBOLS.headers] ||= new Headers()).set(name, String(val));
    }

    send (req, body, status=200, headers) {
        let res = req[SYMBOLS.headers] ||= new Headers();
        if (headers) {
            for (let [key, val] of Object.entries(headers)) {
                res.set(key, String(val));
            }
        }
        return new uWSResponse(body, { status, headers: res });
    }

    notFound (c, next, path) {
        let { fallthrough, notFound } = this.opts;
        if (fallthrough) {
            return next();
        }
        if (notFound) {
            return notFound(c, path);
        }
        return this.send(c, null, 404);
    }

    // Get encoding from accept-encoding header
    enc (accept) {
        let { encodings } = this.opts;
        if (!accept || !encodings || accept === 'identity') {
            return;
        }
        for (let enc of encodings) {
            if (accept.includes(enc)) {
                return enc;
            }
        }
        if (accept.includes('*')) {
            return encodings[0];
        }
    }

    // Get buffer from cache if available, otherwise return stream
    // Note: Key includes mtime and size so changed files aren't served stale
    async cached (path, stat, enc) {
        let { cache, opts: { maxSize }} = this;
        if (cache && stat.size <= maxSize) {
            let key = `${path}:${stat.mtimeMs}:${stat.size}${enc ? ':' + enc : ''}`;
            let buf = cache.get(key);
            if (!buf) {
                buf = await buffer(this.stream(path, stat, enc));
                cache.set(key, buf);
            }
            return buf;
        }
        return this.stream(path, stat, enc);
    }

    // Return a stream of file contents, optionally with compression
    stream (path, stat, enc, start, end) {
        let res = createReadStream(path, { start, end });
        switch (enc) {
            case 'br':
                res = res.pipe(createBrotliCompress());
                break;
            case 'gzip':
                res = res.pipe(createGzip());
                break;
            case 'zstd':
                res = res.pipe(createZstdCompress());
                break;
            case 'deflate':
                res = res.pipe(createDeflate());
                break;
            default:
                break;
        }
        return Readable.toWeb(res);
    }

    cacheControl () {
        let { maxAge, cacheControl, immutable } = this.opts;
        let res = [];
        if (isArray(cacheControl)) {
            res.push(...cacheControl);
        }
        if (isNumeric(maxAge)) {
            res.push(`max-age=${maxAge}`);
        }
        if (immutable) {
            res.push('immutable');
        }
        if (!res.length) {
            return false;
        }
        return res;
    }

    middleware () {

        const {
            dir,
            opts: {
                cache,
                normalize,
                rewrite,
                alias,
                found,
                index,
                encodings,
                lastModified,
                range,
                nosniff
            }
        } = this;

        const cacheControl = this.cacheControl();

        return async (c, next) => {

            if (this.finalized(c)) {
                return next();
            }

            let method = this.method(c);

            // Note: No method means the context shape doesn't match the current adapter
            if (!method) {
                throw new ServeStaticError('Unknown request method, check adapter entrypoint');
            }

            switch (method) {
                case METHODS.get:
                case METHODS.head:
                case METHODS.options:
                    break;
                default:
                    return this.send(c, null, 405, {
                        allow: 'GET, HEAD, OPTIONS'
                    });
            }

            let path;

            try {
                path = decodeURIComponent(this.path(c));
            } catch (err) {
                return this.notFound(c, next, path);
            }

            if (normalize && path.startsWith(normalize)) {
                path = path.slice(normalize.length);
            }

            if (rewrite) {
                path = rewrite(path);
            }

            if (alias && Object.hasOwn(alias, path)) {
                path = alias[path];
            }

            if (!path || REGEX.dot.test(path)) {
                return this.notFound(c, next, path);
            }

            path = join(dir, path);

            // Note: Resolved path must stay inside the root dir
            if (path !== dir && !path.startsWith(dir + sep)) {
                return this.notFound(c, next, path);
            }

            let stat;

            try {
                stat = await fs.stat(path);
            } catch (err) {
                return this.notFound(c, next, path);
            }

            if (stat.isDirectory()) {
                if (index) {
                    path = join(path, 'index.html');
                    try {
                        stat = await fs.stat(path);
                    } catch (err) {
                        return this.notFound(c, next, path);
                    }
                } else {
                    return this.notFound(c, next, path);
                }
            }

            let mime = mimeFromPath(path);

            this.set(c, 'content-type', mime ? mime.header : 'application/octet-stream');

            if (lastModified) {
                this.set(c, 'last-modified', stat.mtime.toUTCString());
            }

            if (range) {
                this.set(c, 'accept-ranges', 'bytes');
            }

            if (nosniff) {
                this.set(c, 'x-content-type-options', 'nosniff');
            }

            if (cacheControl) {
                this.set(c, 'cache-control', cacheControl);
            }

            let body, enc, part, status = 200, compress = encodings && mime?.compress;

            if (range && method === METHODS.get) {
                part = parseRange(this.header(c, 'range'), stat.size);
                if (part === null) {
                    this.set(c, 'content-range', `bytes */${stat.size}`);
                    return this.send(c, null, 416);
                }
            }

            if (compress) {
                this.set(c, 'vary', 'accept-encoding');
                // Note: Range requests are never compressed (ranges refer to specific bytes on disk)
                if (!part) {
                    enc = this.enc(this.header(c, 'accept-encoding'));
                    if (enc) {
                        this.set(c, 'content-encoding', enc);
                    }
                }
            }

            if (method === METHODS.get) {
                if (part) {
                    let [start, end] = part;
                    this.set(c, 'content-length', end - start + 1);
                    this.set(c, 'content-range', `bytes ${start}-${end}/${stat.size}`);
                    status = 206;
                    body = this.stream(path, stat, undefined, start, end);
                } else if (cache) {
                    body = await this.cached(path, stat, enc);
                } else {
                    body = this.stream(path, stat, enc);
                }
            } else if (!enc) {
                // Note: Compressed size is unknown until encoded
                this.set(c, 'content-length', stat.size);
            }

            if (found) {
                found(c, path);
            }

            return this.send(c, body, status);

        }

    }

    static factory () {
        const Fn = this;
        return function factory (...args) {
            return new Fn(...args);
        }
    }

}

export function serveStatic (...args) {
    return new ServeStatic(...args).middleware();
}
