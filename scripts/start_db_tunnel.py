import os
import select
import signal
import socket
import sys
import threading

import paramiko


SSH_HOST = os.getenv("VPS_SSH_HOST", "145.223.27.100")
SSH_PORT = int(os.getenv("VPS_SSH_PORT", "22"))
SSH_USER = os.getenv("VPS_SSH_USER", "root")
SSH_PASSWORD = os.getenv("VPS_SSH_PASSWORD")

LOCAL_HOST = os.getenv("TUNNEL_LOCAL_HOST", "127.0.0.1")
LOCAL_PORT = int(os.getenv("TUNNEL_LOCAL_PORT", "55432"))
REMOTE_HOST = os.getenv("TUNNEL_REMOTE_HOST", "127.0.0.1")
REMOTE_PORT = int(os.getenv("TUNNEL_REMOTE_PORT", "5432"))


shutdown_event = threading.Event()


def bridge_channel(client_socket, ssh_transport):
    channel = None

    try:
        channel = ssh_transport.open_channel(
            "direct-tcpip",
            (REMOTE_HOST, REMOTE_PORT),
            client_socket.getpeername(),
        )

        while not shutdown_event.is_set():
            readable, _, _ = select.select([client_socket, channel], [], [], 1.0)

            if client_socket in readable:
                data = client_socket.recv(65535)
                if not data:
                    break
                channel.sendall(data)

            if channel in readable:
                data = channel.recv(65535)
                if not data:
                    break
                client_socket.sendall(data)
    finally:
        try:
            client_socket.close()
        except OSError:
            pass

        if channel is not None:
            try:
                channel.close()
            except OSError:
                pass


def main():
    if not SSH_PASSWORD:
        raise SystemExit(
            "Defina VPS_SSH_PASSWORD na sessao atual antes de iniciar o tunel.",
        )

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=SSH_HOST,
        port=SSH_PORT,
        username=SSH_USER,
        password=SSH_PASSWORD,
        timeout=20,
    )

    transport = client.get_transport()
    if transport is None:
        raise SystemExit("Nao foi possivel obter o transporte SSH.")

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((LOCAL_HOST, LOCAL_PORT))
    server.listen(50)
    server.settimeout(1.0)

    def shutdown(*_args):
        shutdown_event.set()
        try:
            server.close()
        except OSError:
            pass

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(
        f"Tunnel ativo em {LOCAL_HOST}:{LOCAL_PORT} -> {REMOTE_HOST}:{REMOTE_PORT} via {SSH_USER}@{SSH_HOST}:{SSH_PORT}",
        flush=True,
    )

    try:
        while not shutdown_event.is_set():
            try:
                client_socket, _ = server.accept()
            except socket.timeout:
                continue
            except OSError:
                if shutdown_event.is_set():
                    break
                raise

            thread = threading.Thread(
                target=bridge_channel,
                args=(client_socket, transport),
                daemon=True,
            )
            thread.start()
    finally:
        shutdown_event.set()
        try:
            server.close()
        except OSError:
            pass
        client.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Falha ao iniciar tunnel: {error}", file=sys.stderr, flush=True)
        raise
