import type { Context } from 'hono';
import { ConnAddr, ServeStatic as BaseStatic, StaticOpts } from '../../index.js';

export { default, serve, Server, uWSServer } from '../../index.js';

export class HonoStatic extends BaseStatic<Context> {}

export { HonoStatic as ServeStatic };

export function serveStatic (root?: string, opts?: StaticOpts<Context>): (c: Context, next: () => Promise<void>) => Promise<unknown>;

export function conninfo (c: Context, opts?: { proxy?: boolean }): ConnAddr;
