import { HTTP_METHODS as METHODS, SYM } from './constants.js';
import { RequestError, getHeaders } from './util.js';

export const RequestBuiltIn = globalThis.Request;

export class Request extends RequestBuiltIn {

    constructor (input, opts) {
        if (input?.[SYM.request]) {
            input = input[SYM.request];
        }
        if (opts?.body?.getReader !== undefined) {
            opts.duplex ??= 'half';
        }
        super(input, opts);
    }

}

export class UWSRequest {

    constructor (incoming, outgoing, { defaultHost, scheme='http' }={}) {

        let method = METHODS[incoming.getMethod()] || 'GET';
        let path = incoming.getUrl() || '';
        let query = incoming.getQuery() || '';
        let headers = getHeaders(incoming);
        let host = headers.get('host') || defaultHost;
        let url = new URL(path, `${scheme}://${host}`);
        let ac = new AbortController();

        if (query) {
            url.search = query;
        }

        outgoing.onAborted(() => {
            outgoing.aborted = true;
            ac.abort();
        });

        this[SYM.state] = {
            incoming,
            outgoing,
            method,
            path,
            query,
            headers,
            host,
            scheme,
            url,
            ac
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
        return this.request.signal;
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

        let body, { url, method, headers, ac, outgoing } = this[SYM.state];

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
                        outgoing.onData((chunk, last) => {
                            ctrl.enqueue(new Uint8Array(chunk));
                            if (last) {
                                ctrl.close();
                            } else {
                                if (ctrl.desiredSize <= 0) {
                                    outgoing.pause();
                                }
                            }
                        });
                    },
                    pull (ctrl) {
                        if (ctrl.desiredSize > 0) {
                            outgoing.resume();
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

Object.setPrototypeOf(UWSRequest.prototype, Request.prototype);
