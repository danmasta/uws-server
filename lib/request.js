import { toUpper } from 'lo';
import { HTTP_METHODS as METHODS, SYM } from './constants.js';
import { RequestError } from './util.js';

export function getHeaders (req) {
    let kv = [];
    req.forEach((key, val) => {
        kv.push([key, val]);
    });
    return new Headers(kv);
}

export const RequestBuiltIn = globalThis.Request;

export class Request extends RequestBuiltIn {

    constructor (input, opts) {
        if (typeof input === 'object' && SYM.Request in input) {
            input = input[SYM.Request];
        }
        if (opts?.body?.getReader !== undefined) {
            opts.duplex ??= 'half';
        }
        super(input, opts);
    }

}

export class UWSRequest {

    constructor (req, res, defaultHost, proto='http') {

        let method = toUpper(req.getMethod()) || 'GET';
        let path = req.getUrl() || '';
        let query = req.getQuery() || '';
        let headers = getHeaders(req);
        let host = headers.get('host') || defaultHost;

        if (query) {
            query = '?' + query;
        }

        let url = path + query;

        if (url[0] === '/') {

            if (!host) {
                throw new RequestError('Host header missing');
            }

            if (!(proto === 'http' || proto === 'https')) {
                throw new RequestError('Protocol not supported: %s', proto);
            }

            url = new URL(`${proto}://${host}${url}`);

            if (url.hostname.length !== host.length && url.hostname !== host.replace(/:\d+$/, '')) {
                throw new RequestError('Host header invalid: %s', host);
            }

            url = url.href;

        } else if (url.startsWith('http://') || url.startsWith('https://')) {

            try {
                url = new URL(url).href;
            } catch (err) {
                throw new RequestError(err, 'Absolute URL invalid');
            }

        }

        this[SYM.State] = {
            req,
            res,
            method,
            path,
            query,
            headers,
            host,
            proto,
            url,
            ac: new AbortController()
        };

    }

    // Request instance properties
    // https://developer.mozilla.org/en-US/docs/Web/API/Request#instance_properties
    get method () {
        return this[SYM.State].method;
    }

    get url () {
        return this[SYM.State].url;
    }

    get headers () {
        return this[SYM.State].headers;
    }

    get body () {
        return this.request.body;
    }

    get bodyUsed () {
        return this.request.bodyUsed;
    }

    get cache () {
        return this.request.cache;
    }

    get credentials () {
        return this.request.credentials;
    }

    get destination () {
        return this.request.destination;
    }

    get integrity () {
        return this.request.integrity;
    }

    get mode () {
        return this.request.mode;
    }

    get redirect () {
        return this.request.redirect;
    }

    get referrer () {
        return this.request.referrer;
    }

    get referrerPolicy () {
        return this.request.referrerPolicy;
    }

    get signal () {
        return this.request.signal;
    }

    get keepalive () {
        return this.request.keepalive;
    }

    // Note: Missing from @hono/node-server
    get isReloadNavigation () {
        return this.request.isReloadNavigation;
    }

    // Note: Missing from @hono/node-server
    get isHistoryNavigation () {
        return this.request.isHistoryNavigation;
    }

    // Request instance methods
    // https://developer.mozilla.org/en-US/docs/Web/API/Request#instance_methods
    arrayBuffer () {
        return this.request.arrayBuffer();
    }

    blob () {
        return this.request.blob();
    }

    clone () {
        return this.request.clone();
    }

    formData () {
        return this.request.formData();
    }

    json () {
        return this.request.json();
    }

    text () {
        return this.request.text();
    }

    get request () {
        return this[SYM.Request] ||= this.createRequest();
    }

    createRequest () {

        let body, { url, method, headers, ac, res } = this[SYM.State];

        switch (method) {
            case METHODS.Get:
            case METHODS.Head:
                break;
            case METHODS.Trace:
                let req = new Request(url, {
                    method: METHODS.Get,
                    headers,
                    body,
                    signal: ac.signal
                });
                Object.defineProperty(req, 'method', {
                    value: METHODS.Trace
                });
                return req;
            case METHODS.Options:
            case METHODS.Put:
            case METHODS.Delete:
            case METHODS.Post:
            case METHODS.Patch:
            case METHODS.Connect:
                body = new ReadableStream({
                    start (ctrl) {
                        res.onData((chunk, last) => {
                            ctrl.enqueue(new Uint8Array(chunk));
                            if (last) {
                                ctrl.close();
                            }
                        });
                    }
                });
                break;
            default:
                throw new RequestError('Method not supported: %s', method);
        }

        return new Request(url, { method, headers, body, signal: ac.signal });

    }

}

Object.setPrototypeOf(UWSRequest.prototype, Request.prototype);
