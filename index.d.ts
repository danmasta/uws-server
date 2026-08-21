import type uws from 'uws';
import type { AppOptions, TemplatedApp, HttpRequest, HttpResponse } from 'uws';

type uWSModule = typeof uws;

export const SYMBOLS: {
    readonly req: symbol,
    readonly res: symbol,
    readonly state: symbol
}

export interface ConnAddr {
    address: string,
    port: string,
    family: string | null
}

export function conninfo (req: Request, { proxy }?: { proxy?: boolean }): ConnAddr;

export function createConninfo<C = Request> (getSocket: (c: C) => HttpResponse): (c: C, opts?: { proxy?: boolean }) => ConnAddr;

export class Request extends globalThis.Request {}

export class uWSRequest extends Request {
    constructor (req: HttpRequest, socket: HttpResponse, { defaultHost, scheme }?: {
        defaultHost?: string,
        scheme?: string
    });
    abort (): void;
    discard (max?: number): void;
}

class Response extends globalThis.Response {
    readonly body: ReadableStream<Uint8Array<ArrayBuffer>> | null | unknown;
}

export class uWSResponse extends Response {
    constructor (body?: BodyInit | null | unknown, init?: ResponseInit);
}

class BaseError extends Error {
    constructor (msg?: string | Error, ...args: unknown[]);
    static readonly code: string;
}

export class RequestError extends BaseError {}
export class ResponseError extends BaseError {}
export class ServerError extends BaseError {}
export class ServeStaticError extends BaseError {}

export interface Logger {
    info (message: string, ...args: unknown[]): void;
    error (message: string, ...args: unknown[]): void;
    error (err: Error, ...args: unknown[]): void;
    warn (message: string, ...args: unknown[]): void;
    debug (message: string, ...args: unknown[]): void;
}

// Note: Promise or function that returns a promise or value
type AsyncAction<T = any> = (() => T | Promise<T>) | Promise<T>;

type FetchFn = (req: Request) => Response | Promise<Response>;

export interface ServerOpts {
    fetch: FetchFn | { fetch: FetchFn },
    bind?: string,
    port?: number,
    defaultHost?: string,
    ssl?: boolean,
    http3?: boolean,
    createServer?: (uws: uWSModule, opts: AppOptions, ssl: boolean, http3: boolean) => TemplatedApp,
    app?: AppOptions,
    uws?: uWSModule,
    globals?: boolean,
    discardMax?: number,
    showError?: boolean,
    showStack?: boolean,
    log?: Logger,
    timeout?: number,
    listen?: boolean,
    signals?: string | string[],
    exitOnSignal?: boolean,
    handleUncaught?: boolean,
    exitOnUncaught?: boolean,
    shutdown?: AsyncAction[]
}

type HandlerFn = (res: HttpResponse, req: HttpRequest) => void | Promise<void>;

type ListenFn = (addr: ListenAddr, server: uWSServer) => void;

export interface ListenAddr extends ConnAddr {
    bind: string
}

export interface ErrorOpts {
    msg?: string,
    status?: number
}

export class uWSServer {
    constructor (opts?: ServerOpts, fn?: ListenFn, supp?: ServerOpts);
    app: TemplatedApp | null;
    init (): Promise<void>;
    addShutdownHandler (handler: AsyncAction): void;
    register (method: string, route: string, fn: HandlerFn): void;
    listen (fn: ListenFn): Promise<void>;
    stop (): void;
    exit (code?: number): void;
    drain (): Promise<void>;
    close (): Promise<void>;
    address (): ConnAddr | null;
    errorResponse (err: Error, { msg, status }?: ErrorOpts): Response;
    error (err: Error, socket: HttpResponse, { msg, status }?: ErrorOpts): void;
    clientError (err: Error, socket: HttpResponse, opts?: ErrorOpts): void;
    serverError (err: Error, socket: HttpResponse, opts?: ErrorOpts): void;
    respond (res: Response, socket: HttpResponse): Promise<void>;
    static factory (defs?: ServerOpts): (opts?: ServerOpts, fn?: ListenFn) => uWSServer;
}

export function serve (opts?: ServerOpts, fn?: ListenFn): Promise<void>;

export function Server (opts?: ServerOpts, fn?: ListenFn): uWSServer;

export interface StaticOpts<C = Request> {
    cwd?: string,
    root?: string,
    normalize?: string,
    index?: boolean,
    rewrite?: (path: string) => string,
    alias?: Record<string, string>,
    lastModified?: boolean,
    nosniff?: boolean,
    maxAge?: number,
    cacheControl?: string[] | boolean,
    immutable?: boolean,
    etag?: boolean,
    cache?: boolean,
    max?: number,
    maxSize?: number,
    encodings?: string[] | boolean,
    range?: boolean,
    fallthrough?: boolean,
    found?: (c: C, path: string) => void,
    notFound?: (c: C, path: string) => unknown
}

type NextFn = () => Promise<void> | void;

type MiddlewareFn<C = Request> = (c: C, next?: NextFn) => Promise<unknown>;

export class ServeStatic<C = Request> {
    constructor (root?: string, opts?: StaticOpts<C>);
    finalized (c: C): boolean;
    path (c: C): string;
    method (c: C): string;
    header (c: C, name: string): string | undefined;
    set (c: C, name: string, val: string | number | string[]): void;
    send (c: C, body?: unknown, status?: number, headers?: Record<string, string>): unknown;
    notFound (c: C, next: NextFn, path: string): unknown;
    middleware (): MiddlewareFn<C>;
    static factory(): (root?: string, opts?: StaticOpts) => ServeStatic;
}

export function serveStatic(root?: string, opts?: StaticOpts): MiddlewareFn;

export default serve;
