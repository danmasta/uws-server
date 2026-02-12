import { METHODS_HTTP as METHODS, SYM } from './constants.js';
import { RequestError, getHeaders } from './util.js';

export const RequestBuiltIn = globalThis.Request;

export class Request extends RequestBuiltIn {

    constructor (input, opts) {
        if (input?.[SYM.request]) {
            input = input[SYM.request];
        }
        if (opts?.body?.getReader) {
            opts.duplex ??= 'half';
        }
        super(input, opts);
    }

}

export class uWSRequest {

    constructor (req, socket, { defaultHost, scheme='http' }={}) {

        let method = METHODS[req.getMethod()] || 'GET';
        let path = req.getUrl() || '';
        let query = req.getQuery() || '';
        let headers = getHeaders(req);
        let host = headers.get('host') || defaultHost;
        let url = new URL(path, `${scheme}://${host}`);

        if (query) {
            url.search = query;
        }

        this[SYM.state] = {
            socket,
            req,
            method,
            path,
            query,
            headers,
            host,
            scheme,
            url,
            ac: new AbortController()
        };

    }

    // Request instance properties
    // https://developer.mozilla.org/en-US/docs/Web/API/Request#instance_properties
    get method () {
        return this[SYM.state].method;
    }

    get url () {
        return this[SYM.state].url.href;
    }

    get headers () {
        return this[SYM.state].headers;
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
        return this[SYM.state].ac.signal;
    }

    get keepalive () {
        return this.request.keepalive;
    }

    get isReloadNavigation () {
        return this.request.isReloadNavigation;
    }

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
        return this[SYM.request] ||= this.createRequest();
    }

    createRequest () {

        let body, { url, method, headers, ac, socket } = this[SYM.state];

        switch (method) {
            case METHODS.get:
            case METHODS.head:
                break;
            case METHODS.trace:
                let req = new Request(url, {
                    method: METHODS.get,
                    headers,
                    signal: ac.signal
                });
                Object.defineProperty(req, 'method', {
                    value: METHODS.trace
                });
                return req;
            case METHODS.options:
            case METHODS.put:
            case METHODS.delete:
            case METHODS.post:
            case METHODS.patch:
            case METHODS.connect:
                // Note: Chunk represents a packet, size can vary based on MTU
                body = new ReadableStream({
                    start (ctrl) {
                        socket.onData((chunk, last) => {
                            ctrl.enqueue(new Uint8Array(chunk));
                            if (last) {
                                ctrl.close();
                            } else {
                                if (ctrl.desiredSize <= 0) {
                                    socket.pause();
                                }
                            }
                        });
                    },
                    pull (ctrl) {
                        if (ctrl.desiredSize > 0) {
                            socket.resume();
                        }
                    }
                }, {
                    highWaterMark: 32
                });
                break;
            default:
                throw new RequestError('Method not supported: %s', method);
        }

        return new Request(url, { method, headers, body, signal: ac.signal });

    }

}

Object.setPrototypeOf(uWSRequest.prototype, Request.prototype);
