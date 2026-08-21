import type { Context } from 'elysia';
import { ConnAddr, ServeStatic as BaseStatic, StaticOpts } from '../../index.js';

export { default, serve, Server, uWSServer } from '../../index.js';

export class ElysiaStatic extends BaseStatic<Context> {}

export { ElysiaStatic as ServeStatic };

export function serveStatic (root?: string, opts?: StaticOpts<Context>): (c: Context, next?: () => unknown) => Promise<unknown>;

export function conninfo (c: Context, opts?: { proxy?: boolean }): ConnAddr;
