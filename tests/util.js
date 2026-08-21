import { SYMBOLS } from '../lib/constants.js';
import { conninfo, parseRange } from '../lib/util.js';

describe('util', () => {

    describe('conninfo', () => {

        it('should read the socket from the request state', () => {
            let req = {
                [SYMBOLS.state]: {
                    socket: {
                        getRemoteAddress: () => new Uint8Array([127, 0, 0, 1]).buffer,
                        getRemotePort: () => 1234
                    }
                }
            };
            assert.deepEqual(conninfo(req), { address: '127.0.0.1', port: 1234, family: 'ipv4' });
        });

    });

    describe('parseRange', () => {

        it('should parse basic ranges', () => {
            assert.deepEqual(parseRange('bytes=0-4', 10), [0, 4]);
            assert.deepEqual(parseRange('bytes=0-0', 10), [0, 0]);
            assert.deepEqual(parseRange('bytes=0-9', 10), [0, 9]);
            assert.deepEqual(parseRange('bytes=2-5', 10), [2, 5]);
        });

        it('should parse open ended ranges', () => {
            assert.deepEqual(parseRange('bytes=5-', 10), [5, 9]);
            assert.deepEqual(parseRange('bytes=0-', 10), [0, 9]);
        });

        it('should parse suffix ranges', () => {
            assert.deepEqual(parseRange('bytes=-3', 10), [7, 9]);
            assert.deepEqual(parseRange('bytes=-10', 10), [0, 9]);
            assert.deepEqual(parseRange('bytes=-100', 10), [0, 9]);
        });

        it('should clamp end to file size', () => {
            assert.deepEqual(parseRange('bytes=0-9999', 10), [0, 9]);
            assert.deepEqual(parseRange('bytes=8-100', 10), [8, 9]);
        });

        it('should use the last range in a list', () => {
            assert.deepEqual(parseRange('bytes=0-1, 5-6', 10), [5, 6]);
            assert.deepEqual(parseRange('bytes=0-1,-2', 10), [8, 9]);
        });

        it('should return null when unsatisfiable', () => {
            assert.isNull(parseRange('bytes=10-', 10));
            assert.isNull(parseRange('bytes=999-1000', 10));
            assert.isNull(parseRange('bytes=-0', 10));
            assert.isNull(parseRange('bytes=0-', 0));
            assert.isNull(parseRange('bytes=-5', 0));
        });

        it('should return undefined when absent or invalid', () => {
            assert.isUndefined(parseRange(undefined, 10));
            assert.isUndefined(parseRange('', 10));
            assert.isUndefined(parseRange('items=0-4', 10));
            assert.isUndefined(parseRange('bytes=abc', 10));
            assert.isUndefined(parseRange('bytes=a-b', 10));
            assert.isUndefined(parseRange('bytes=1.5-3', 10));
            assert.isUndefined(parseRange('bytes=5-2', 10));
            assert.isUndefined(parseRange('bytes=--5', 10));
            assert.isUndefined(parseRange('bytes=-', 10));
        });

    });

});
