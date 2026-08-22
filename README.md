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
* Support for in-memory file caching
* 0 external dependencies

## About
Lightweight, high-performance server implementation based on [uWebSockets](https://github.com/uNetworking/uWebSockets.js). Provides a native server interface for the fetch API handler pattern, and supports fetch based edge frameworks like [Hono](https://github.com/honojs/hono), [Elysia](https://github.com/elysiajs/elysia), [H3](https://github.com/h3js/h3), or any other framework that supports [web standards APIs](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API). See [adapters](#adapters) for framework-specific entrypoints.

Based on the [benchmarks](#results), `uws-server` is able to achieve ~90% throughput of vanilla uWebSockets. But with the added benefit of being able to use higher-level frameworks with advanced routing and middleware support.

For more information, check out the [FAQs](https://github.com/danmasta/uws-server/discussions/1)

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
Any framework that supports web standards APIs can be used. You only need to provide a `fetch` function that accepts a [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object, and returns a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) object
```js
serve({
    fetch: async (req) => {
        return new Response(...);
    }
});
```
You can also pass an app instance directly, any object that exposes a `fetch` method works (Hono, Elysia, H3, etc)
```js
const app = new Hono();

serve({
    fetch: app
});
```

## Adapters
The main entrypoint exports are framework-neutral. The `serve`, `serveStatic`, and `conninfo` functions work directly with native web standard `Request` objects. Framework-specific versions are available from the adapter entrypoints
```js
import { serve, serveStatic } from 'uws-server/hono';
import { serve, serveStatic } from 'uws-server/elysia';
import { serve, serveStatic } from 'uws-server/h3';
```
*Note: Each adapter exports the base server functions (`serve`, `Server`), plus a `ServeStatic` subclass, `serveStatic` factory, and `conninfo` function bound to that framework's context shape*

### Custom Adapters
The base serve static middleware reads and writes through six overridable context accessor methods, so adding support for a new framework is a small subclass
```js
import { createConninfo, ServeStatic } from 'uws-server';

// Implement accessor methods based on the context shape
class CustomStatic extends ServeStatic {
    finalized (c) {}
    path (c) {}
    method (c) {}
    header (c, name) {}
    set (c, name, val) {}
    send (c, body, status, headers) {}
}

// Conninfo is created from a socket getter
const conninfo = createConninfo(c => c.socket);
```
*Note: The base server exports (`serve`, `Server`) are generic and work with any framework unchanged. Only the `ServeStatic` subclass accessor methods and `conninfo` getter function need to be implemented for a new framework*

## Documentation
### Server
Base entrypoint for initializing a uWS server instance. You can use the `uWSServer` class directly, or use the factory functions `Server` and `serve`
```js
import { uWSServer, Server, serve } from 'uws-server';
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
`ssl` | *`boolean`* | Enable `SSL`. You will need to supply `app` options for the key/cert configuration. Default is `false`
`http3` | *`boolean`* | Enable `HTTP/3`. This is [experimental](https://github.com/uNetworking/uWebSockets/issues/1280). Default is `false`
`createServer` | *`function`* | Custom function to use when generating the server instance. Default is `undefined`
`app` | *`object`* | Custom [`AppOptions`](https://unetworking.github.io/uWebSockets.js/generated/interfaces/AppOptions.html) to pass to `uWebSockets` on server instance creation. Default is `undefined`
`uws` | *`object`* | `uWebSockets` default export to use for generating server instances. If this is not set, it will be loaded via dynamic import on `listen`. Default is `undefined`
`globals` | *`boolean`* | If `true`, overrides the built-in `Request` and `Response` globals with lightweight versions that are lazily created when accessed. Note: This is required for the fastest response path. When disabled, framework responses are full built-in `Response` objects, which are slower to create and stream. Default is `true`
`discardMax` | *`number`* | Maximum unread request body bytes to drain when a response is sent without reading the body. Larger or unknown remainders respond with `connection: close` instead, so clients don't reuse a connection that is still mid-request. Default is `32768`
`showError` | *`boolean`* | Include error message in the response text for uncaught errors during the `Request`/`Response` flow. Default is `true`
`showStack` | *`boolean`* | Include error stack trace in the response text for uncaught errors during the `Request`/`Response` flow. Default is `false`
`log` | *`object`* | Log implementation to use. Custom loggers should at least implement the methods: `info`, `error`, `warn`, `debug`, and support printf style [string formatting](https://nodejs.org/api/util.html#utilformatformat-args). Default is `console`
`timeout` | *`number`* | Maximum time to wait for connections to drain during graceful shutdown in milliseconds. Default is `10000`
`listen` | *`boolean`* | Start listen socket on server create. Default is `false`
`signals` | *`string\|string[]`* | [Signals](https://nodejs.org/api/os.html#signal-constants) to listen to for graceful shutdown. Default is `['SIGINT', 'SIGTERM']`
`exitOnSignal` | *`boolean`* | Enable exiting process after signal shutdown. Default is `true`
`handleUncaught` | *`boolean`* | Enable handling uncaught exceptions and rejections. Default is `true`
`exitOnUncaught` | *`boolean`* | Enable exiting process after uncaught exception or rejection. Default is `true`
`shutdown` | *`function\|promise`* | Handlers to execute on graceful shutdown. Handlers can be `functions` or `promises`, they are executed in order and `awaited`. Default is `undefined`

### ServeStatic
Middleware for serving static files from the file system. You can use the `ServeStatic` class directly, or use the factory function `serveStatic`
```js
// Generic, serves web standard Requests
import { ServeStatic, serveStatic } from 'uws-server';

// Framework adapters
import { ServeStatic, serveStatic } from 'uws-server/hono';
```
Supports compression, range requests, and in-memory caching. The generic version accepts a `Request` and returns a lazy `uWSResponse`, so it can be used with a native server without framework
```js
const assets = serveStatic('public', { fallthrough: true });

serve({
    fetch: req => assets(req, () => handler(req))
});
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
`alias` | *`object`* | Static map to use for rewriting file paths before lookup. Default is `undefined`
`lastModified` | *`boolean`* | Enable setting the `last-modified` header. Default is `true`
`nosniff` | *`boolean`* | Enable setting the `x-content-type-options` header. Default is `true`
`maxAge` | *`number`* | Time in seconds to remain fresh in cache. Used to set the [`max-age`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#max-age) cache-control header directive. Default is `86400` (1 day)
`cacheControl` | *`string[]\|boolean`* | List of [directives](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#directives) to add to the cache-control header. Default is `['public']`
`immutable` | *`boolean`* | Add the [`immutable`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#immutable) cache-control header directive. Useful if you're using versioned/hashed file names for cache-busting. Default is `false`
`cache` | *`boolean`* | Enable in-memory LRU cache for files. Default is `false`
`max` | *`number`* | Max entry size of LRU cache. Default is `1024`
`maxSize` | *`number`* | Max allowed size of files to cache in bytes. Files larger than this are not cached and always streamed from disk. Default is `1048576` (1MB)
`encodings` | *`string[]\|boolean`* | Enable compression support. Should be a list of compression algorithms in order of preference. Setting to `false` will disable compression support. Default is `['br', 'gzip', 'zstd', 'deflate']`
`range` | *`boolean`* | Enable support for [range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests). Default is `true`
`fallthrough` | *`boolean`* | Allow not found requests to continue downstream to other handlers. Default is `false`
`found` | *`function(c, path)`* | Function to call for each found request. Return value is ignored. Default is `undefined`
`notFound` | *`function(c, path)`* | Function to call for each not found request. Return value will be used as the `404` response. Default is `undefined` (sends an empty `404` response)

## Benchmarks
Quick benchmark to an endpoint that returns zero bytes with a `200` status code (`i7`, `wsl2`, node `v22.x`)
```
bombardier --fasthttp -l -d 10s -c 128 "http://localhost:8080/health"
```
### uWebSockets (vanilla)
```
Statistics        Avg      Stdev        Max
  Reqs/sec    159074.38   18865.07  192568.37
  Latency      803.23us     1.19ms   139.73ms
  Latency Distribution
     50%   652.00us
     75%     1.02ms
     90%     1.45ms
     95%     1.81ms
     99%     2.72ms
  HTTP codes:
    1xx - 0, 2xx - 1590616, 3xx - 0, 4xx - 0, 5xx - 0
    others - 0
  Throughput:    24.27MB/s
```
### Hono
```
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
uWebSockets | 159,074.38 | 192,568.37 | 2.72ms | `8.46x`-`8.93x`
Hono | 142,158.70 | 176,572.69 | 2.95ms | `7.56x`-`8.19x`
H3 | 106,615.78 | 122,120.10 | 2.92ms | `5.67x`-`5.66x`
Elysia | 58,095.49 | 62,637.02 | 4.42ms | `3.09x`-`2.90x`
Express | 18,794.08 | 21,559.27 | 12.98ms | `1x`-`1x`

*Elysia with uWS sees `3x` improvement over Express. While H3 with uWS sees over `5x` improvement, and Hono with uWS sees over `7x` improvement*

> [!NOTE]
> Based on the results, `uws-server` is able to achieve ~90% throughput of vanilla uWebSockets. But with the added benefit of being able to use higher-level frameworks with advanced routing and middleware support. The extra overhead comes from the framework routing layer and the creation of `Request`/`Response` objects during the request flow

## Examples
Serve a Hono app instance on port `8080`, and static assets from the `build` directory at the `/static` mount path
```js
import { serve, serveStatic } from 'uws-server/hono';
import { Hono } from 'hono';

const app = new Hono();

app.use('/static/*', serveStatic('build', {
    normalize: '/static',
    cache: true
}));

serve({
    fetch: app,
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
Serve `favicon` using `alias` or `rewrite`
```js
// With alias
const assets = serveStatic('build', {
    normalize: '/static',
    alias: {
        '/favicon.ico': '/img/favicon.ico'
    }
});

// With rewrite
const assets = serveStatic('build', {
    normalize: '/static',
    rewrite: (path) => {
        switch (path) {
            case '/favicon.ico':
                return '/img/favicon.ico';
            default:
                return path;
        }
    }
});

app.use('/static/*', assets);
app.use('/favicon.ico', assets);
```

## Testing
Tests are currently run using mocha and chai. To execute tests run `make test`. To generate unit test coverage reports run `make coverage`

## Contact
If you have any questions feel free to get in touch
