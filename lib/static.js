import { defaults, isObject, lru, resolve } from 'lo';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { createBrotliCompress, createDeflate, createGzip, createZstdCompress } from 'node:zlib';
import { METHODS_HTTP as METHODS, REGEX } from './constants.js';
import { mimeFromPath } from './mime.js';
import { ServeStaticError } from './util.js';

const defs = {
    cwd: cwd(),
    root: undefined,
    normalize: undefined,
    index: false,
    rewrite: undefined,
    etag: false, // (Not implemented)
    immutable: false, // (Not implemented)
    lastModified: true,
    maxAge: 0, // milliseconds (Not implemented)
    cacheControl: true, // (Not implemented)
    nosniff: true,
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
// Supports compression and in-memory caching
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

    notFound (c, next, path) {
        let { fallthrough, notFound } = this.opts;
        if (notFound) {
            return notFound(c, path);
        }
        if (fallthrough) {
            return next();
        }
        return c.notFound();
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

    // Get unit/ranges from range header
    ranges (str) {
        let { range } = this.opts;
        if (range) {
            return str?.split(REGEX.range);
        }
    }

    // Get buffer from cache if available, otherwise return stream
    async cached (path, stat, enc, start, end) {
        let { cache, opts: { maxSize }} = this;
        if (cache) {
            if (stat.size <= maxSize) {
                let key = enc ? `${path}:${enc}` : path;
                let buf = cache.get(key);
                if (!buf) {
                    buf = await buffer(this.stream(path, stat, enc, start, end));
                    cache.set(key, buf);
                }
                return buf;
            }
        }
        return this.stream(path, stat, enc, start, end);
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

    middleware () {

        const {
            dir,
            opts: {
                cache,
                normalize,
                rewrite,
                found,
                index,
                encodings,
                lastModified,
                range,
                nosniff
            }
        } = this;

        return async (c, next) => {

            if (c.finalized) {
                return next();
            }

            let path = decodeURIComponent(c.req.path);

            if (normalize && path.startsWith(normalize)) {
                path = path.slice(normalize.length);
            }

            if (rewrite) {
                path = rewrite(path);
            }

            if (REGEX.dot.test(path)) {
                return this.notFound(c, next, path);
            }

            path = join(dir, path);

            let stat;

            try {
                stat = await fs.stat(path);
            } catch (err) {
                return this.notFound(c, next, path);
            }

            if (stat?.isDirectory()) {
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

            if (mime) {
                c.header('content-type', mime.header);
            } else {
                c.header('content-type', 'application/octet-stream');
            }

            if (lastModified) {
                c.header('last-modified', stat.mtime.toUTCString());
            }

            if (range) {
                c.header('accept-ranges', 'bytes');
            }

            if (nosniff) {
                c.header('x-content-type-options', 'nosniff');
            }

            let body, enc, status = 200, compress = encodings && mime.compress;

            if (compress) {
                enc = this.enc(c.req.header('accept-encoding'));
                c.header('vary', 'accept-encoding');
                if (enc) {
                    c.header('content-encoding', enc);
                }
            }

            switch (c.req.method) {
                case METHODS.head:
                case METHODS.options:
                    c.header('content-length', stat.size);
                    break;
                case METHODS.get:
                    // Note: Only the last range is supported
                    let ranges = this.ranges(c.req.header('range'));
                    if (ranges && ranges[0] === 'bytes') {
                        let tail = parseInt(ranges.pop(), 10) || stat.size - 1;
                        let head = parseInt(ranges.pop(), 10) || 0;
                        let size = tail - head + 1;
                        if (stat.size < size) {
                            tail = stat.size - 1;
                        }
                        c.header('content-length', size);
                        c.header('content-range', `bytes ${head}-${tail}/${stat.size}`);
                        status = 206;
                        body = this.stream(path, stat, enc, head, tail);
                    } else {
                        if (cache) {
                            body = await this.cached(path, stat, enc);
                        } else {
                            body = this.stream(path, stat, enc);
                        }
                    }
                    break;
                default:
                    return c.body(null, 405, {
                        allow: 'HEAD, OPTIONS, GET'
                    });
            }

            if (found) {
                found(c, path);
            }

            return c.body(body, status);

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
