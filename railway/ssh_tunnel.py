"""Необязательный SSH-туннель Railway -> localhost API на машине бота."""
import asyncio
import logging
import os
from pathlib import Path
import tempfile

log = logging.getLogger(__name__)


async def ssh_context(app):
    host = os.getenv('BOT_SSH_HOST')
    if not host:
        yield
        return
    user = os.environ['BOT_SSH_USER']
    port = int(os.getenv('BOT_SSH_PORT', '22'))
    key = os.environ['BOT_SSH_PRIVATE_KEY']
    known_hosts = os.environ['BOT_SSH_KNOWN_HOSTS']
    # Не допускаем интерпретации адресов как параметров командной строки.
    if not host or host.startswith('-') or any(c.isspace() for c in host) or not user or user.startswith('-') or any(c.isspace() for c in user):
        raise RuntimeError('Некорректный SSH host/user')
    if not key.strip() or not known_hosts.strip() or not 1 <= port <= 65535:
        raise RuntimeError('Проверьте SSH-настройки')
    with tempfile.TemporaryDirectory(prefix='apes-ssh-') as folder:
        private = Path(folder)/'identity'
        hosts = Path(folder)/'known_hosts'
        private.write_text(key.strip()+'\n'); private.chmod(0o600)
        hosts.write_text(known_hosts.strip()+'\n'); hosts.chmod(0o600)
        args = ['ssh', '-N', '-T', '-p', str(port), '-l', user, '-i', str(private),
            '-L', '127.0.0.1:18787:127.0.0.1:8787',
            '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={hosts}',
            '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=10',
            '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3', host]
        async def monitor():
            while True:
                process = await asyncio.create_subprocess_exec(*args, stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                try:
                    code = await process.wait()
                    log.warning('SSH-туннель отключился (код %s), повтор через 5 секунд. Проверьте SSH-настройки, ключ и known_hosts.', code)
                finally:
                    if process.returncode is None:
                        process.terminate()
                        try:
                            await asyncio.wait_for(process.wait(), timeout=5)
                        except asyncio.TimeoutError:
                            process.kill()
                            await process.wait()
                await asyncio.sleep(5)
        task = asyncio.create_task(monitor())
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
