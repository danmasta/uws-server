import { SYMBOLS } from '../lib/constants.js';
import { Request, RequestBuiltIn } from '../lib/request.js';
import { ResponseBuiltIn, uWSResponse } from '../lib/response.js';

describe('response', () => {

    it('should accept a native response as init', () => {
        let init = new ResponseBuiltIn('a', { status: 201, headers: { 'x-a': '1' } });
        let res = new uWSResponse('b', init);
        assert.equal(res.status, 201);
        assert.equal(res.headers.get('x-a'), '1');
        assert.equal(res[SYMBOLS.state].body, 'b');
    });

    it('should accept a uWSResponse as init', () => {
        let init = new uWSResponse('a', { status: 201, headers: { 'x-a': '1' } });
        let res = new uWSResponse('b', init);
        assert.equal(res.status, 201);
        assert.equal(res.headers.get('x-a'), '1');
        assert.equal(res[SYMBOLS.state].body, 'b');
    });

    it('should accept null and undefined init', () => {
        assert.equal(new uWSResponse('x', null).status, 200);
        assert.equal(new uWSResponse('x').status, 200);
        assert.equal(new uWSResponse('x').statusText, '');
    });

    it('should match instanceof for builtin and wrapped responses', () => {
        assert.instanceOf(ResponseBuiltIn.json({ a: 1 }), uWSResponse);
        assert.instanceOf(new uWSResponse('x'), uWSResponse);
        assert.instanceOf(new uWSResponse('x'), ResponseBuiltIn);
    });

    it('should inherit static methods', () => {
        assert.isFunction(uWSResponse.json);
        assert.equal(uWSResponse.redirect('http://localhost/').status, 302);
        assert.equal(uWSResponse.json({ a: 1 }).headers.get('content-type'), 'application/json');
    });

    it('should not build the native response on headers access', () => {
        let res = new uWSResponse('hello');
        assert.instanceOf(res.headers, Headers);
        assert.isUndefined(res[SYMBOLS.res]);
        assert.equal(res[SYMBOLS.state].body, 'hello');
    });

    it('should serialize json body types when read through the response api', async () => {
        let res = new uWSResponse({ a: 1 });
        res.headers;
        assert.equal(await res.text(), '{"a":1}');
        assert.equal(res.headers.get('content-type'), 'application/json');

        assert.deepEqual(await new uWSResponse([1, 2]).json(), [1, 2]);
        assert.equal(await new uWSResponse(1).text(), '1');
        assert.equal(await new uWSResponse('plain').text(), 'plain');
    });

    it('should match instanceof for builtin and wrapped requests', () => {
        assert.instanceOf(new RequestBuiltIn('http://localhost/'), Request);
        assert.instanceOf(new Request('http://localhost/'), RequestBuiltIn);
    });

});
