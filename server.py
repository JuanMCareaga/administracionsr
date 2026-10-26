#!/usr/bin/env python3
import json
import os
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
DATABASE = ROOT / "app.db"
PORT = int(os.environ.get("PORT", "8000"))
COLLECTIONS = {"tasks", "stock", "expenses"}


def get_connection():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                tag TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS stock (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                value REAL NOT NULL DEFAULT 0
            );
            """
        )


def read_collection(collection):
    with get_connection() as connection:
        rows = connection.execute(f"SELECT * FROM {collection}").fetchall()

    result = []
    for row in rows:
        item = dict(row)
        if collection == "tasks":
            item["completed"] = bool(item["completed"])
        result.append(item)
    return result


def replace_collection(collection, items):
    with get_connection() as connection:
        connection.execute(f"DELETE FROM {collection}")
        if collection == "tasks":
            connection.executemany(
                "INSERT INTO tasks (id, text, description, tag, completed) VALUES (?, ?, ?, ?, ?)",
                [
                    (
                        item["id"],
                        item["text"],
                        item.get("description", ""),
                        item["tag"],
                        int(bool(item.get("completed", False))),
                    )
                    for item in items
                ],
            )
        elif collection == "stock":
            connection.executemany(
                "INSERT INTO stock (id, name, quantity) VALUES (?, ?, ?)",
                [(item["id"], item["name"], int(item["quantity"])) for item in items],
            )
        else:
            connection.executemany(
                "INSERT INTO expenses (id, name, value) VALUES (?, ?, ?)",
                [(item["id"], item["name"], float(item["value"])) for item in items],
            )


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.strip("/").split("/")
        if len(path) == 2 and path[0] == "api" and path[1] in COLLECTIONS:
            self.send_json(200, read_collection(path[1]))
            return
        super().do_GET()

    def do_PUT(self):
        path = urlparse(self.path).path.strip("/").split("/")
        if len(path) != 2 or path[0] != "api" or path[1] not in COLLECTIONS:
            self.send_json(404, {"error": "Endpointo no encontrado"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            items = json.loads(self.rfile.read(length))
            if not isinstance(items, list):
                raise ValueError("El cuerpo debe ser una lista")
            replace_collection(path[1], items)
            self.send_json(200, read_collection(path[1]))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError, sqlite3.Error) as error:
            self.send_json(400, {"error": str(error)})

    def do_DELETE(self):
        path = urlparse(self.path).path.strip("/").split("/")
        if len(path) != 2 or path[0] != "api" or path[1] not in COLLECTIONS:
            self.send_json(404, {"error": "Endpointo no encontrado"})
            return
        replace_collection(path[1], [])
        self.send_json(200, [])


if __name__ == "__main__":
    initialize_database()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), AppHandler)
    print(f"Servidor disponible en http://localhost:{PORT}")
    print("Para otra computadora en la misma red, usá la IP de esta máquina.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()
