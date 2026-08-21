import {
    DISCARD_MAX,
    HIGH_WATER_MARK,
    METHODS_HTTP as METHODS,
    SYMBOLS
} from './constants.js';
import { RequestError, getHeaderEntries } from './util.js';

export const RequestBuiltIn = globalThis.Request;

// Note: Methods that can include a request body
const BODY_METHODS = new Set([
    METHODS.options,
    METHODS.put,
    METHODS.delete,
    METHODS.post,
    METHODS.patch
]);

export class Request extends RequestBuiltIn {

    constructor (input, opts) {
        if (input?.[SYMBOLS.state]) {
            input = input.request;
        } else if (input?.[SYMBOLS.req]) {
            input = input[SYMBOLS.req];
        }
        if (opts?.body?.getReader) {
            opts = { ...opts, duplex: opts.duplex ?? 'half' };
        }
        super(input, opts);
    }

    // Note: Support instanceof
    static [Symbol.hasInstance] (obj) {
        return obj instanceof RequestBuiltIn;
    }

}

export class uWSRequest {

    constructor (req, socket, { defaultHost, scheme='http' }={}) {

        let method = METHODS[req.getMethod()] || 'GET';
        let path = req.getUrl() || '';
        let query = req.getQuery() || '';
        let headers = getHeaderEntries(req);
        let host = req.getHeader('host') || defaultHost;
        let url = new URL(path, `${scheme}://${host}`);

        if (query) {
            url.search = query;
        }

        this[SYMBOLS.state] = {
            socket,
            method,
            path,
            query,
            headers,
            host,
            scheme,
            url,
            ac: null,
            aborted: false
        };

        if (BODY_METHODS.has(method)) {
            this.readBody(req);
        }

    }

    // Register onData synchronously and buffer until the stream is created
    // Note: uWS drops body data received before onData is registered, and pause
    // does not protect chunks that arrive with the headers
    readBody (req) {

        let { socket } = this[SYMBOLS.state];
        let len = req.getHeader('content-length');

        // Note: Resuming a socket that was never paused breaks uWS abort detection,
        // track pause state and only resume when paused
        let body = this[SYMBOLS.state].body = {
            queue: [],
            ended: false,
            done: false,
            ctrl: null,
            length: len ? Number(len) : NaN,
            received: 0,
            paused: false,
            pause () {
                if (!this.paused) {
                    this.paused = true;
                    socket.pause();
                }
            },
            resume () {
                if (this.paused) {
                    this.paused = false;
                    socket.resume();
                }
            }
        };

        // Note: Chunk memory is owned by uWS and reused after the callback
        // returns (must be copied)
        // Note: Chunk represents whatever body bytes are in the uWS receive
        // buffer at read time (one packet up to 512KB)
        socket.onData((chunk, last) => {
            if (body.done) {
                return;
            }
            body.received += chunk.byteLength;
            chunk = new Uint8Array(chunk.slice(0));
            if (body.ctrl) {
                body.ctrl.enqueue(chunk);
                if (last) {
                    body.done = body.ended = true;
                    body.ctrl.close();
                } else if (body.ctrl.desiredSize <= 0) {
                    body.pause();
                }
            } else {
                body.queue.push(chunk);
                if (last) {
                    body.ended = true;
                }
            }
            // Note: Resume once the body has fully arrived so uWS abort detection
            // works again while the request is processed
            if (last) {
                body.resume();
            }
        });

        // Pause until the body is read
        // Chunks already received by uWS are still delivered so the queue
        // holds at most in-flight data
        // Note: Abort detection is suspended while paused, it recovers once
        // the stream resumes the socket on first read
        body.pause();

    }

    // Request instance properties
    // https://developer.mozilla.org/en-US/docs/Web/API/Request#instance_properties
    get method () {
        return this[SYMBOLS.state].method;
    }

    get url () {
        return this[SYMBOLS.state].url.href;
    }

    // Note: Header entries are read eagerly since the uWS req object is not valid
    // after the handler returns
    // Note: Headers construction is deferred
    get headers () {
        let { headers } = this[SYMBOLS.state];
        if (!(headers instanceof Headers)) {
            return this[SYMBOLS.state].headers = new Headers(headers);
        }
        return headers;
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

    // Note: Controller is created lazily
    // If the socket is already aborted, the signal is created pre-aborted
    get signal () {
        let state = this[SYMBOLS.state];
        let { ac } = state;
        if (!ac) {
            ac = state.ac = new AbortController();
            if (state.aborted) {
                ac.abort();
            }
        }
        return ac.signal;
    }

    // Called on socket abort (aborts the signal if created)
    abort () {
        let state = this[SYMBOLS.state];
        state.aborted = true;
        state.ac?.abort();
    }

    // Drop any unread body and resume the socket so the request can complete
    // and the connection stays reusable
    // Note: Must be called before the response ends (socket can't be resumed after end)
    // Note: When the unread remainder is larger than max or unknown,
    // signal connection close instead
    discard (max=DISCARD_MAX) {
        let { body, socket } = this[SYMBOLS.state];
        if (!body || body.done) {
            return;
        }
        body.done = true;
        body.queue = [];
        body.ctrl?.close();
        if (!body.ended && !(body.length - body.received <= max)) {
            socket.shouldClose = true;
            return;
        }
        body.resume();
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
        return this[SYMBOLS.req] ||= this.createRequest();
    }

    createRequest () {

        let body, signal = this.signal, { url, method, headers } = this[SYMBOLS.state];

        switch (method) {
            case METHODS.get:
            case METHODS.head:
                break;
            // Note: Fetch spec forbids TRACE and CONNECT, construct as GET
            // then patch the method
            case METHODS.trace:
            case METHODS.connect:
                let req = new Request(url, {
                    method: METHODS.get,
                    headers,
                    signal
                });
                Object.defineProperty(req, 'method', {
                    value: method
                });
                return req;
            case METHODS.options:
            case METHODS.put:
            case METHODS.delete:
            case METHODS.post:
            case METHODS.patch:
                body = this.createBody();
                break;
            default:
                throw new RequestError('Method not supported: %s', method);
        }

        return new Request(url, { method, headers, body, signal });

    }

    // Wrap the buffered body in a ReadableStream
    createBody () {

        let signal = this.signal, { socket, body } = this[SYMBOLS.state];

        return new ReadableStream({
            start (ctrl) {
                for (let chunk of body.queue) {
                    ctrl.enqueue(chunk);
                }
                body.queue = [];
                if (body.ended) {
                    body.done = true;
                    ctrl.close();
                    return;
                }
                if (signal.aborted) {
                    body.done = true;
                    ctrl.error(signal.reason);
                    return;
                }
                signal.addEventListener('abort', () => {
                    if (!body.done) {
                        body.done = true;
                        ctrl.error(signal.reason);
                    }
                });
                body.ctrl = ctrl;
            },
            pull (ctrl) {
                if (!socket.aborted && !socket.done && ctrl.desiredSize > 0) {
                    body.resume();
                }
            },
            cancel () {
                body.done = true;
                if (!socket.aborted && !socket.done) {
                    body.pause();
                }
            }
        }, {
            highWaterMark: HIGH_WATER_MARK
        });

    }

}

Object.setPrototypeOf(uWSRequest.prototype, Request.prototype);
