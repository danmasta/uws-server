# uWS Server
uWebSockets server based on web standards APIs

#### Features:
* Simple and lightweight
* Blazingly fast :fire:
* Support for web standards based frameworks
* Support for http, ssl, and http3
* 0 external dependencies

## About
Lightweight server implementation based on [uWebSockets](https://github.com/uNetworking/uWebSockets.js). Originally designed with the [hono](#hono) framework in mind, it can also be used with [elysia](#elysia) or any other framework/runtime that supports [web standards APIs](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).

## Usage
Add `uws-server` as a dependency and install via npm
```sh
npm install uws-server@danmasta/uws-server --save
```
Install a specific [version](https://github.com/danmasta/uws-server/tags)
```sh
npm install uws-server@danmasta/uws-server#semver:^v0.0.0 --save
```
*See documentation regarding git dependencies [here](https://danmasta.github.io/lo/installation)*

Install [`uWebSockets`](https://github.com/uNetworking/uWebSockets.js)
```sh
npm install uws@uNetworking/uWebSockets.js --save
```
### Hono
Usage with [hono](https://github.com/honojs/hono) is very similar to the [node-server](https://github.com/honojs/node-server) adapter:
```js
import { Hono } from 'hono';
import { serve } from 'uws-server';

const app = new Hono();

serve({
    fetch: app.fetch
}, (info, server) => {
    console.log('uWS server listening on %s:%d', info.address, info.port);
});
```
### Elysia
Usage with [elysia](https://github.com/elysiajs/elysia) is also very simple, just pass the `fetch` handler to `serve`:
```js
import { Elysia } from 'elysia';
import { serve } from 'uws-server';

const app = new Elysia();

serve({
    fetch: app.fetch
}, (info, server) => {
    console.log('uWS server listening on %s:%d', info.address, info.port);
});
```
### Other
Any other framework that supports web standards APIs can also be used. You only need to provide a `fetch` function that accepts a [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object, and returns a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) object:
```js
import { serve } from 'uws-server';

function entrypoint (request) {
    return new Response(...);
}

serve({
    fetch: entrypoint
}, (info, server) => {
    console.log('uWS server listening on %s:%d', info.address, info.port);
});
```
### Static
Serving static files is not yet implemented, but is planned

## Documentation
### serve
Base entrypoint for initializing a uWS server instance

Signature:
```js
serve(opts?, fn?(info, server));
```

#### Options
Name | Type | Description
-----|----- | -----------
`fetch` | *`function`* | Custom function to use when generating a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response). Default is `undefined`
`bind` | *`string`* | Address to bind server to. This can be a wildcard address (`::`, `0.0.0.0`), loopback address (`127.0.0.1`, `::1`, `localhost`), or a specific interface address (`10.0.0.1`). Default is `::`
`port` | *`number`* | Port to listen on (`undefined` or `null` will allocate a random port). Default is `undefined`
`host` | *`string`* | Default host to use for requests without a host header. Default is `undefined`
`ssl` | *`boolean`* | Enable `ssl`. Default is `false`
`http3` | *`boolean`* | Enable `http3`. This is [experimental](https://github.com/uNetworking/uWebSockets/issues/1280). Default is `false`
`createServer` | *`function`* | Custom function to use to generate the server instance. Default is `undefined`
`server` | *`object`* | Custom [`AppOptions`](https://unetworking.github.io/uWebSockets.js/generated/interfaces/AppOptions.html) to pass to `uWebSockets` on server instance creation. Default is `undefined`
`uws` | *`object`* | `uWebSockets` default export to use for generating server instances. If this is not set, `serve` will attempt to load via dynamic import. Default is `undefined`
`globals` | *`boolean`* | This library borrows the concept of lightweight `Request` and `Response` classes from hono, in which the `Request` and `Repsonse` classes are lazily created when accessed. If `true`, this will enable overriding of the built-in `Request` and `Response` classes. *This functionality is subject to change or removal. Default is `true`
`includeError` | *`boolean`* | Whether to include the error message in the response text for uncaught errors during the `Request`/`Response` flow. Default is `true`

## Benchmarks
TBD

## Examples
Generate custom uWebSockets server instances
```js
import uws from 'uws';
import { serve } from 'uws-server';

function createServer () {
    return uws.App();
}

serve({
    createServer,
    uws
});
```

## Testing
Tests are currently run using mocha and chai. To execute tests run `make test`. To generate unit test coverage reports run `make coverage`

## Contact
If you have any questions feel free to get in touch
