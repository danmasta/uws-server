import { SYM } from './constants.js';

export const ResponseBuiltIn = globalThis.Response;

export class UWSResponse {

    constructor (body, init) {

        let headers, status;

        if (init instanceof Response) {
            if (SYM.Response in init) {
                init = init[SYM.Response];
            } else {
                init = init[SYM.State].init;
                headers = new Headers(init.headers);
            }
        }

        if (typeof body === 'string' || body?.getReader !== undefined || body instanceof Blob || body instanceof Uint8Array) {
            headers ||= init?.headers || { 'content-type': 'text/plain; charset=utf-8' };
            status = init?.status || 200;
        }

        this[SYM.State] = {
            body,
            init,
            headers,
            status
        };

    }

    // Response instance properties
    // https://developer.mozilla.org/en-US/docs/Web/API/Response#instance_properties
    get headers () {
        let headers = this[SYM.State].headers;
        if (headers) {
            if(!(headers instanceof Headers)) {
                return this[SYM.State].headers = new Headers(headers);
            }
            return headers;
        }
        return this.response.headers;
    }

    get status () {
        return this[SYM.State].status ?? this.response.status;
    }

    get ok () {
        return this.status >= 200 && this.status < 300;
    }

    get body () {
        return this.response.body;
    }

    get bodyUsed () {
        return this.response.bodyUsed;
    }

    get redirected () {
        return this.response.redirected;
    }

    get statusText () {
        return this.response.statusText;
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
        return this[SYM.Response] ||= this.createResponse();
    }

    createResponse () {
        let { body, init } = this[SYM.State];
        return new ResponseBuiltIn(body, init);
    }

}

Object.setPrototypeOf(UWSResponse.prototype, Response.prototype);
