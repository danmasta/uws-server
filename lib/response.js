import { SYM } from './constants.js';

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

    constructor (body, opts={}) {

        if (opts instanceof Response) {
            opts = opts[SYM.response] || opts[SYM.state];
        }

        // Note: Don't copy body from opts
        // https://developer.mozilla.org/en-US/docs/Web/API/Response/Response#options
        let { headers, status=200, statusText='' } = opts;

        this[SYM.state] = {
            body,
            headers,
            status,
            statusText
        };

    }

    // Response instance properties
    // https://developer.mozilla.org/en-US/docs/Web/API/Response#instance_properties
    get headers () {
        let headers = this[SYM.state].headers;
        if (headers) {
            if(!(headers instanceof Headers)) {
                return this[SYM.state].headers = new Headers(headers);
            }
            return headers;
        }
        return this.response.headers;
    }

    get status () {
        return this[SYM.state].status ?? this.response.status;
    }

    get ok () {
        return this.status >= 200 && this.status < 300;
    }

    get body () {
        return this[SYM.response] ? this[SYM.response].body : this[SYM.state].body;
    }

    get bodyUsed () {
        return this.response.bodyUsed;
    }

    get redirected () {
        return this.response.redirected;
    }

    get statusText () {
        return this[SYM.state].statusText ?? this.response.statusText;
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
        return this[SYM.response] ||= this.createResponse();
    }

    createResponse () {
        return new ResponseBuiltIn(this[SYM.state].body, this[SYM.state]);
    }

}

Object.setPrototypeOf(uWSResponse.prototype, Response.prototype);
