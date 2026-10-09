#!/usr/bin/env python3
"""
Servidor de desenvolvimento do Assistente — só biblioteca padrão do Python.

O que faz:
  • Vigia a pasta da extensão. Quando você salva um arquivo:
      - em rules/      → a extensão baixa as regras de novo (sem recarregar nada)
      - qualquer outro → a extensão se recarrega sozinha e as abas do Onvio também
  • Serve http://localhost:35729/regras.json direto do seu disco.

Como usar (uma vez por sessão de trabalho):
    python dev/dev_server.py
Deixe a janela aberta enquanto edita. Ctrl+C para parar.
"""
import base64, hashlib, json, os, socket, struct, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 35729
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RULES = os.path.join(ROOT, 'rules', 'regras.json')
IGNORE_DIRS = {'.git', 'node_modules', '__pycache__', 'dev', 'tests', 'docs', '.claude', '.vscode', '.idea'}
IGNORE_EXT = {'.swp', '.tmp', '.zip', '.crx', '.pem'}
clients = set()
lock = threading.Lock()


def ws_send(sock, text):
    data = text.encode('utf-8')
    header = bytes([0x81])
    n = len(data)
    if n < 126:
        header += bytes([n])
    elif n < 65536:
        header += bytes([126]) + struct.pack('>H', n)
    else:
        header += bytes([127]) + struct.pack('>Q', n)
    sock.sendall(header + data)


def broadcast(msg):
    with lock:
        dead = []
        for c in clients:
            try:
                ws_send(c, msg)
            except OSError:
                dead.append(c)
        for c in dead:
            clients.discard(c)
    if msg != 'ping':
        print(f'[{time.strftime("%H:%M:%S")}] -> {msg}  ({len(clients)} conectada(s))')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith('/ws') and self.headers.get('Upgrade', '').lower() == 'websocket':
            key = self.headers['Sec-WebSocket-Key']
            accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            self.send_response(101)
            self.send_header('Upgrade', 'websocket')
            self.send_header('Connection', 'Upgrade')
            self.send_header('Sec-WebSocket-Accept', accept)
            self.end_headers()
            sock = self.connection
            with lock:
                clients.add(sock)
            print(f'[{time.strftime("%H:%M:%S")}] extensão conectada')
            try:
                while True:  # descarta o que chegar; mantém a conexão viva
                    if not sock.recv(1024):
                        break
            except OSError:
                pass
            with lock:
                clients.discard(sock)
            return
        if self.path.split('?')[0] == '/regras.json':
            try:
                with open(RULES, 'rb') as f:
                    body = f.read()
                json.loads(body.decode('utf-8'))  # valida antes de servir
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
            except json.JSONDecodeError as e:
                body = json.dumps({'erro': f'regras.json inválido: {e}'}).encode()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                print(f'!! regras.json com erro de sintaxe: {e}')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.end_headers()
        self.wfile.write('Servidor dev do Assistente rodando.'.encode())


def snapshot():
    out = {}
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in files:
            if os.path.splitext(f)[1] in IGNORE_EXT or f.startswith('.'):
                continue
            p = os.path.join(base, f)
            try:
                out[p] = os.stat(p).st_mtime_ns
            except OSError:
                pass
    return out


def watcher():
    prev = snapshot()
    while True:
        time.sleep(0.5)
        cur = snapshot()
        changed = [p for p in set(cur) | set(prev) if cur.get(p) != prev.get(p)]
        prev = cur
        if not changed:
            continue
        rel = [os.path.relpath(p, ROOT) for p in changed]
        print('   alterado:', ', '.join(rel))
        only_rules = all(r.replace('\\', '/').startswith('rules/') for r in rel)
        time.sleep(0.2)
        broadcast('rules' if only_rules else 'reload')


def pinger():
    while True:
        time.sleep(20)
        if clients:
            broadcast('ping')


if __name__ == '__main__':
    threading.Thread(target=watcher, daemon=True).start()
    threading.Thread(target=pinger, daemon=True).start()
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Assistente — servidor dev em http://localhost:{PORT}  (pasta: {ROOT})')
    print('Edite e salve os arquivos: a extensão recarrega sozinha. Ctrl+C para sair.')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nencerrado.')
        sys.exit(0)
