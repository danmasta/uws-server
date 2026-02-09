# uWS Server
uWebSockets server based on web standards APIs

#### Features:
* Simple and lightweight
* Blazingly fast :fire:
* Support for web standards based frameworks
* Supports `HTTP`, `SSL`, and `HTTP/3`
* Support for streaming request and response bodies
* Handles backpressure
* Graceful shutdown and connection draining
* Signal handling
* Support for handling uncaught exceptions
* Serve static middleware
* Compression support: `br`, `gzip`, `zstd`, `deflate`
* Support for in-memory caching
* 0 external dependencies

## About
Lightweight server implementation based on [uWebSockets](https://github.com/uNetworking/uWebSockets.js). Originally designed with the [Hono](#hono) framework in mind, it can also be used with [Elysia](#elysia) or any other framework/runtime that supports [web standards APIs](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).

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
Import functions
```js
import { serve, serveStatic } from 'uws-server';
```
### Hono
Usage with [Hono](https://github.com/honojs/hono) is similar to the [node-server](https://github.com/honojs/node-server) adapter:
```js
import { Hono } from 'hono';

const app = new Hono();

serve({
    fetch: app.fetch
});
```
### Elysia
Usage with [Elysia](https://github.com/elysiajs/elysia) is also very simple, just pass the `fetch` handler to `serve`:
```js
import { Elysia } from 'elysia';

const app = new Elysia();

serve({
    fetch: app.fetch
});
```
### Other Frameworks
Any other framework that supports web standards APIs can also be used. You only need to provide a `fetch` function that accepts a [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object, and returns a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) object:
```js
function fetch (request) {
    return new Response(...);
}

serve({
    fetch
});
```

## Documentation
### Server
Base entrypoint for initializing a uWS server instance. You can use the `Server` class directly, or use the factory function `serve`
```js
import { Server, serve } from 'uws-server';
```
#### Signature:
```js
serve(opts?, fn?(info, server));
```

#### Options
Name | Type | Description
-----|----- | -----------
`fetch` | *`function`* | Function to use when generating a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response). Default is `undefined`
`bind` | *`string`* | Address to bind server to. This can be a wildcard address (`::`, `0.0.0.0`), loopback address (`127.0.0.1`, `::1`, `localhost`), or a specific interface address (`10.0.0.1`). Default is `::`
`port` | *`number`* | Port to listen on (`undefined` or `null` will allocate a random port). Default is `undefined`
`defaultHost` | *`string`* | Default host to use for requests without a host header. Default is `undefined`
`ssl` | *`boolean`* | Enable `SSL`. You will need to supply `server` options for the key/cert configuration. Default is `false`
`http3` | *`boolean`* | Enable `HTTP/3`. This is [experimental](https://github.com/uNetworking/uWebSockets/issues/1280). Default is `false`
`createServer` | *`function`* | Custom function to use when generating the server instance. Default is `undefined`
`server` | *`object`* | Custom [`AppOptions`](https://unetworking.github.io/uWebSockets.js/generated/interfaces/AppOptions.html) to pass to `uWebSockets` on server instance creation. Default is `undefined`
`uws` | *`object`* | `uWebSockets` default export to use for generating server instances. If this is not set, `serve` will attempt to load via dynamic import. Default is `undefined`
`globals` | *`boolean`* | This library borrows the concept of lightweight `Request` and `Response` classes from Hono, in which the `Request` and `Repsonse` objects are lazily created when accessed. If `true`, this will enable overriding of the built-in `Request` and `Response` classes. *This functionality is subject to change or removal. Default is `true`
`showError` | *`boolean`* | Include error message in the response text for uncaught errors during the `Request`/`Response` flow. Default is `true`
`showStack` | *`boolean`* | Include error stack trace in the response text for uncaught errors during the `Request`/`Response` flow. Default is `false`
`log` | *`object`* | Log implementation to use. Custom loggers should at least implement the methods: `info`, `error`, `warn`, `debug`, and support printf style [string formatting](https://nodejs.org/api/util.html#utilformatformat-args). Default is `console`
`timeout` | *`number`* | Maximum time to wait for connections to drain during graceful shutdown in milliseconds. Default is `10000`
`listen` | *`boolean`* | Start listen socket on server create. Default is `true`
`signals` | *`string\|string[]`* | [Signals](https://nodejs.org/api/os.html#signal-constants) to listen to for graceful shutdown. Default is `['SIGINT', 'SIGTERM']`
`exitOnSignal` | *`boolean`* | Enable exiting process after signal shutdown. Default is `true`
`handleUncaught` | *`boolean`* | Enable handling uncaught exceptions and rejections. Default is `true`
`exitOnUncaught` | *`boolean`* | Enable exiting process after uncaught exception or rejection. Default is `true`
`shutdown` | *`function\|promise`* | Handlers to execute on graceful shutdown. Handlers can be `functions` or `promises`, they are executed in order and `awaited`. Default is `undefined`

### ServeStatic
Middleware for serving static files from the file system. You can use the `ServeStatic` class directly, or use the factory function `serveStatic`
```js
import { ServeStatic, serveStatic } from 'uws-server';
```
#### Signature:
```js
serveStatic(root?, opts?);
```

#### Options
Name | Type | Description
-----|----- | -----------
`cwd` | *`string`* | Base path to resolve relative paths from. Default is `process.cwd`
`root` | *`string`* | Directory to serve files from. Default is `undefined`
`normalize` | *`string`* | String to remove from beginning of request paths. If you mounted the middleware at `/static/*`, Hono will include `/static` in the request path. Setting this option to `/static` would remove the leading mount point. Default is `undefined`
`index` | *`boolean`* | Enable serving `index.html` if a matched path is a directory. Default is `false`
`rewrite` | *`function(path)`* | Function to use for rewriting file paths before lookup. Default is `undefined`
`lastModified` | *`boolean`* | Enable setting the `last-modified` header. Default is `true`
`nosniff` | *`boolean`* | Enable setting the `x-content-type-options` header. Default is `true`
`cache` | *`boolean`* | Enable in-memory LRU cache for files. Default is `false`
`max` | *`number`* | Max entry size of LRU cache. Default is `1024`
`maxSize` | *`number`* | Max allowed size of files to cache in bytes. Files larger than this are not cached and always streamed from disk. Default is `1048576` (1MB)
`encodings` | *`string[]\|boolean`* | Enable compression support. Should be a list of compression algorithms in order of preference. Setting to `false` will disable compression support. Default is `['br', 'gzip', 'zstd', 'deflate']`
`range` | *`boolean`* | Enable support for [range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests). Default is `true`
`fallthrough` | *`boolean`* | Allow not found requests to continue downstream to other handlers. Default is `false`
`found` | *`function(c, path)`* | Function to call for each found request. Return value is ignored. Default is `undefined`
`notFound` | *`function(c, path)`* | Function to call for each not found request. Return value will be used as the `404` response. Default is `undefined`

## Benchmarks
Quick benchmark to a simple endpoint that returns zero bytes with a 200 status code on my local machine (`i7`, `wsl2`, node `v22.15.0`):
### Hono
```
bombardier --fasthttp -l -d 10s -c 128 "http://localhost:8080/health"

Statistics        Avg      Stdev        Max
  Reqs/sec    142158.70   17551.53  176572.69
  Latency        0.90ms   768.26us   146.56ms
  Latency Distribution
     50%   777.00us
     75%     1.11ms
     90%     1.50ms
     95%     1.86ms
     99%     2.95ms
  HTTP codes:
    1xx - 0, 2xx - 1414384, 3xx - 0, 4xx - 0, 5xx - 0
    others - 0
  Throughput:    21.18MB/s
```
### H3
```
bombardier --fasthttp -l -d 10s -c 128 "http://localhost:8080/health"

Statistics        Avg      Stdev        Max
  Reqs/sec    106615.78   13159.17  122120.10
  Latency        1.21ms     1.10ms   129.36ms
  Latency Distribution
     50%     1.10ms
     75%     1.44ms
     90%     1.88ms
     95%     2.17ms
     99%     2.92ms
  HTTP codes:
    1xx - 0, 2xx - 1059614, 3xx - 0, 4xx - 0, 5xx - 0
    others - 0
  Throughput:    22.13MB/s
```
### Elysia
```
bombardier --fasthttp -l -d 10s -c 128 "http://localhost:8080/health"

Statistics        Avg      Stdev        Max
  Reqs/sec     58095.49    3815.93   62637.02
  Latency        2.22ms     1.48ms   129.70ms
  Latency Distribution
     50%     2.00ms
     75%     2.21ms
     90%     2.77ms
     95%     3.88ms
     99%     4.42ms
  HTTP codes:
    1xx - 0, 2xx - 575371, 3xx - 0, 4xx - 0, 5xx - 0
    others - 0
  Throughput:    11.85MB/s
```
### Express (non-uws)
```
bombardier --fasthttp -l -d 10s -c 128 "http://localhost:8080/health"

Statistics        Avg      Stdev        Max
  Reqs/sec     18794.08    1940.57   21559.27
  Latency        6.85ms     2.55ms   210.50ms
  Latency Distribution
     50%     6.30ms
     75%     7.22ms
     90%     8.05ms
     95%     8.90ms
     99%    12.98ms
  HTTP codes:
    1xx - 0, 2xx - 186828, 3xx - 0, 4xx - 0, 5xx - 0
    others - 0
  Throughput:     5.29MB/s
```
### Results
Name | Req/s (avg) | Req/s (max) | p99 | Multiplier
-----|-------------|-------------|-----|-----------
Hono | 142,158.70 | 176,572.69 | 2.95ms | `7.56x`-`8.19x`
H3 | 106,615.78 | 122,120.10 | 2.92ms | `5.67x`-`5.66x`
Elysia | 58,095.49 | 62,637.02 | 4.42ms | `3.09x`-`2.90x`
Express | 18,794.08 | 21,559.27 | 12.98ms | `1x`-`1x`

*Elysia with uWS sees `3x` improvement over Express. While H3 with uWS sees over `5x` improvement, and Hono with uWS sees over `7x` improvement*

## Examples
Serve a Hono app instance on port `8080`, and static assets from the `build` directory at the `/static` mount path
```js
import { serve, serveStatic } from 'uws-server';
import { Hono } from 'hono';

const app = new Hono();

app.use('/static/*', serveStatic('build', {
    normalize: '/static',
    cache: true
}));

serve({
    fetch: app.fetch,
    port: 8080
});
```
Generate custom uWebSockets server instances
```js
import { serve } from 'uws-server';
import uws from 'uws';

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
