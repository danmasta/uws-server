import type { H3Event } from 'h3';
import { ConnAddr, ServeStatic as BaseStatic, StaticOpts } from '../../index.js';

export { default, serve, Server, uWSServer } from '../../index.js';

export class H3Static extends BaseStatic<H3Event> {}

export { H3Static as ServeStatic };

export function serveStatic (root?: string, opts?: StaticOpts<H3Event>): (e: H3Event, next?: () => unknown) => Promise<unknown>;

export function conninfo (e: H3Event, opts?: { proxy?: boolean }): ConnAddr;
