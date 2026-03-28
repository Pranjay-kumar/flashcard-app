import socket
import threading
import time
import sys

from app import app as flask_app
from app import warmup_whisper_models
from PySide6.QtCore import QUrl
from PySide6.QtWidgets import QApplication, QMainWindow
from PySide6.QtWebEngineWidgets import QWebEngineView


HOST = "127.0.0.1"
DEFAULT_PORT = 5000


def find_available_port(host: str, preferred_port: int) -> int:
    for port in range(preferred_port, preferred_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((host, port))
                return port
            except OSError:
                continue

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def wait_for_server(host: str, port: int, timeout_seconds: float = 12.0) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        try:
            sock.connect((host, port))
            sock.close()
            return True
        except OSError:
            time.sleep(0.2)
        finally:
            sock.close()
    return False


def run_flask(host: str, port: int) -> None:
    flask_app.run(host=host, port=port, debug=False, use_reloader=False)


def main() -> None:
    port = find_available_port(HOST, DEFAULT_PORT)
    app_url = f"http://{HOST}:{port}"

    threading.Thread(target=warmup_whisper_models, daemon=True).start()
    threading.Thread(target=run_flask, args=(HOST, port), daemon=True).start()

    if not wait_for_server(HOST, port):
        raise RuntimeError("Flask server did not start in time.")

    app = QApplication(sys.argv)
    window = QMainWindow()
    window.setWindowTitle("Flashcard App")
    window.resize(1280, 820)
    window.setMinimumSize(980, 640)

    view = QWebEngineView()
    view.setUrl(QUrl(app_url))
    window.setCentralWidget(view)
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
