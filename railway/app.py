import base64
import hmac
import os
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
from aiohttp import web
from ssh_tunnel import ssh_context

ROOT = Path(__file__).parent


def create_app():
    username = os.environ['PANEL_USERNAME']
    password = os.environ['PANEL_PASSWORD']
    token = os.environ['EVENTS_API_TOKEN']
    backend = ('http://127.0.0.1:18787' if os.getenv('BOT_SSH_HOST') else os.environ['BOT_API_URL'].rstrip('/'))
    if len(password) < 16 or len(token) < 32:
        raise RuntimeError('PANEL_PASSWORD: от 16 символов; EVENTS_API_TOKEN: от 32')
    parsed = urlparse(backend)
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost')):
        raise RuntimeError('BOT_API_URL должен использовать HTTPS')

    @web.middleware
    async def guard(request, handler):
        if request.path == '/healthz':
            return web.json_response({'ok': True})
        valid = False
        try:
            kind, encoded = request.headers.get('Authorization', '').split(' ', 1)
            user, pwd = base64.b64decode(encoded, validate=True).decode().split(':', 1)
            valid = kind.lower() == 'basic' and hmac.compare_digest(user.encode(), username.encode()) and hmac.compare_digest(pwd.encode(), password.encode())
        except (ValueError, UnicodeError):
            pass
        if not valid:
            return web.Response(status=401, text='Требуется вход', headers={'WWW-Authenticate': 'Basic realm="APES Events", charset="UTF-8"'})
        if request.method != 'GET' and request.headers.get('X-Panel-Request') != '1':
            return web.json_response({'error': 'Недопустимый запрос'}, status=403)
        response = await handler(request)
        response.headers.update({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
        return response

    app = web.Application(middlewares=[guard], client_max_size=32*1024)

    async def session_context(app):
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30), trust_env=True) as session:
            app['http'] = session
            yield
    app.cleanup_ctx.append(ssh_context)
    app.cleanup_ctx.append(session_context)

    async def index(request):
        return web.FileResponse(ROOT/'static/index.html')

    async def proxy(request):
        headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
        body = await request.read() if request.method == 'POST' else None
        try:
            async with app['http'].request(request.method, backend+request.path, headers=headers, data=body, allow_redirects=False) as upstream:
                if 300 <= upstream.status < 400:
                    raise aiohttp.ClientError('Unexpected redirect')
                if upstream.content_type != 'application/json':
                    raise aiohttp.ClientError('Unexpected response')
                return web.Response(body=await upstream.read(), status=upstream.status, content_type='application/json')
        except (aiohttp.ClientError, TimeoutError):
            return web.json_response({'error': 'Нет связи с ботом. Если вы отправляли событие, проверьте Discord и повторите тот же запрос.'}, status=502)

    app.router.add_get('/healthz', lambda r: web.json_response({'ok': True}))
    app.router.add_get('/', index)
    app.router.add_get('/api/catalog', proxy)
    app.router.add_get('/api/events', proxy)
    app.router.add_post('/api/events', proxy)
    app.router.add_static('/static/', ROOT/'static', show_index=False)
    return app


if __name__ == '__main__':
    web.run_app(create_app(), host='0.0.0.0', port=int(os.getenv('PORT', '8080')), access_log=None)
