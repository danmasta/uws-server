import { getType, TYPES } from 'lo';
import { SYMBOLS } from './constants.js';

export const ResponseBuiltIn = globalThis.Response;

// Note: When returning a context response like c.text, c.json, c.html, etc,
//   the raw value is passed as 'body', and the default headers,
//   context headers, and context status are passed as 'opts'.
// When returning a response via c.body, the raw value is passed as 'body',
//   no default headers are passed,
//   but context headers, and context status are passed as 'opts'.
// When returning a value directly from a handler, it's assumed to be a Response object, it
//   bypasses this class and is sent directly to the response handler. If the
//   returned value is null or undefined, it will generate an empty Response.
export class uWSResponse {

    constructor (body, opts) {

        if (opts instanceof Response) {
            opts = opts[SYMBOLS.res] || opts[SYMBOLS.state] || opts;
        }

        // Note: Don't copy body from opts
        // https://developer.mozilla.org/en-US/docs/Web/API/Response/Response#options
        let { headers, status=200, statusText='' } = opts || {};

        this[SYMBOLS.state] = {
            body,
            headers,
            status,
            statusText
        };

    }

    // Response instance properties
    // https://developer.mozilla.org/en-US/docs/Web/API/Response#instance_properties
    // Note: Don't fall back to the native Response for headers
    // Creating it coerces the raw body type, which changes the response
    get headers () {
        let headers = this[SYMBOLS.state].headers;
        if (headers) {
            if(!(headers instanceof Headers)) {
                return this[SYMBOLS.state].headers = new Headers(headers);
            }
            return headers;
        }
        return this[SYMBOLS.state].headers = new Headers();
    }

    get status () {
        return this[SYMBOLS.state].status ?? this.response.status;
    }

    get ok () {
        return this.status >= 200 && this.status < 300;
    }

    get body () {
        return this[SYMBOLS.res] ? this[SYMBOLS.res].body : this[SYMBOLS.state].body;
    }

    get bodyUsed () {
        return this.response.bodyUsed;
    }

    get redirected () {
        return this.response.redirected;
    }

    get statusText () {
        return this[SYMBOLS.state].statusText ?? this.response.statusText;
    }

    get trailers () {
        return this.response.trailers;
    }

    get type () {
        return this.response.type;
    }

    get url () {
        return this.response.url;
    }

    // Response instance methods
    // https://developer.mozilla.org/en-US/docs/Web/API/Response#instance_methods
    arrayBuffer () {
        return this.response.arrayBuffer();
    }

    blob () {
        return this.response.blob();
    }

    clone () {
        return this.response.clone();
    }

    formData () {
        return this.response.formData();
    }

    json () {
        return this.response.json();
    }

    text () {
        return this.response.text();
    }

    get response () {
        return this[SYMBOLS.res] ||= this.createResponse();
    }

    // Serialize JSON body types the same as server respond
    // So text, json, clone, and respond methods stay consistent for raw bodies
    createResponse () {
        let { body, status, statusText } = this[SYMBOLS.state];
        switch (getType(body)) {
            case TYPES.Number:
            case TYPES.Boolean:
            case TYPES.NaN:
            case TYPES.Infinity:
            case TYPES.Array:
            case TYPES.Object:
            case TYPES.Date:
                let headers = this.headers;
                if (!headers.has('content-type')) {
                    headers.set('content-type', 'application/json');
                }
                body = JSON.stringify(body);
                break;
        }
        return new ResponseBuiltIn(body, { headers: this.headers, status, statusText });
    }

    // Note: Support instanceof
    static [Symbol.hasInstance] (obj) {
        return obj instanceof ResponseBuiltIn;
    }

    // Lazy version of the json helper
    // Note: Serializes eagerly so strings and null match spec output
    static json (data, init) {
        let body = JSON.stringify(data);
        if (body === undefined) {
            throw new TypeError('Data is not JSON serializable');
        }
        let res = new this(body, init);
        let headers = res.headers;
        if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
        }
        return res;
    }

    // Lazy version of the redirect helper
    // Note: Accepts relative urls and any status unlike the builtin
    static redirect (url, status=302) {
        return new this(null, {
            status,
            headers: [['location', String(url)]]
        });
    }

}

Object.setPrototypeOf(uWSResponse.prototype, Response.prototype);

// Note: Inherit remaining static methods (error)
Object.setPrototypeOf(uWSResponse, ResponseBuiltIn);
