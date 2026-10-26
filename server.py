```python
#!/usr/bin/env python3

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).parent
DATABASE_URL = os.environ.get("DATABASE_URL")
PORT = int(os.environ.get("PORT", "8000"))

COLLECTIONS = {"tasks", "stock", "expenses"}


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("Falta configurar DATABASE_URL en Render")

    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        connect_timeout=10,
    )


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS public.tasks (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                tag TEXT NOT NULL,
                completed BOOLEAN NOT NULL DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS public.stock (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS public.expenses (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                value NUMERIC NOT NULL DEFAULT 0
            );
            """
        )


def read_collection(collection):
    if collection not in COLLECTIONS:
        raise ValueError("Colección inválida")

    with get_connection() as connection:
        rows = connection.execute(
            f"SELECT * FROM public.{collection}"
        ).fetchall()

    result = []
    for row in rows:
        item = dict(row)

        if collection == "tasks":
            item["completed"] = bool(item["completed"])

        if collection == "expenses":
            item["value"] = float(item["value"])

        result.append(item)

    return result


def replace_collection(collection, items):
    if collection not in COLLECTIONS:
        raise ValueError("Colección inválida")

    with get_connection() as connection:
        connection.execute(f"DELETE FROM public.{collection}")

        if collection == "tasks":
            connection.executemany(
                """
                INSERT INTO public.tasks
                    (id, text, description, tag, completed)
                VALUES (%s, %s, %s, %s, %s)
                """,
                [
                    (
                        item["id"],
                        item["text"],
                        item.get("description", ""),
                        item["tag"],
                        bool(item.get("completed", False)),
                    )
                    for item in items
                ],
            )

        elif collection == "stock":
            connection.executemany(
                """
                INSERT INTO public.stock (id, name, quantity)
                VALUES (%s, %s, %s)
                """,
                [
                    (
                        item["id"],
                        item["name"],
                        int(item["quantity"]),
                    )
                    for item in items
                ],
            )

        else:
            connection.executemany(
                """
                INSERT INTO public.expenses (id, name, value)
                VALUES (%s, %s, %s)
                """,
                [
                    (
                        item["id"],
                        item["name"],
                        float(item["value"]),
                    )
                    for item in items
                ],
            )


class AppHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=str(ROOT),
            **kwargs,
        )

    def end_headers(self):
        self.send_header(
            "Access-Control-Allow-Origin",
            "*",
        )
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(
            payload,
            ensure_ascii=False,
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )
        self.send_header(
            "Content-Length",
            str(len(body)),
        )
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, PUT, DELETE, OPTIONS",
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type",
        )
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.strip("/").split("/")

        if (
            len(path) == 2
            and path[0] == "api"
            and path[1] in COLLECTIONS
        ):
            try:
                self.send_json(
                    200,
                    read_collection(path[1]),
                )
            except Exception:
                self.log_error("Error leyendo la colección")
                self.send_json(
                    500,
                    {"error": "Error al leer los datos"},
                )
            return

        super().do_GET()

    def do_PUT(self):
        path = urlparse(self.path).path.strip("/").split("/")

        if (
            len(path) != 2
            or path[0] != "api"
            or path[1] not in COLLECTIONS
        ):
            self.send_json(
                404,
                {"error": "Endpoint no encontrado"},
            )
            return

        try:
            length = int(
                self.headers.get("Content-Length", "0")
            )
            items = json.loads(self.rfile.read(length))

            if not isinstance(items, list):
                raise ValueError(
                    "El cuerpo debe ser una lista"
                )

            replace_collection(path[1], items)

            self.send_json(
                200,
                read_collection(path[1]),
            )

        except (
            ValueError,
            KeyError,
            TypeError,
            json.JSONDecodeError,
            psycopg.Error,
        ):
            self.log_error("Error guardando la colección")
            self.send_json(
                400,
                {"error": "No se pudieron guardar los datos"},
            )

    def do_DELETE(self):
        path = urlparse(self.path).path.strip("/").split("/")

        if (
            len(path) != 2
            or path[0] != "api"
            or path[1] not in COLLECTIONS
        ):
            self.send_json(
                404,
                {"error": "Endpoint no encontrado"},
            )
            return

        try:
            replace_collection(path[1], [])
            self.send_json(200, [])
        except Exception:
            self.log_error("Error eliminando la colección")
            self.send_json(
                500,
                {"error": "No se pudieron eliminar los datos"},
            )


if __name__ == "__main__":
    initialize_database()

    server = ThreadingHTTPServer(
        ("0.0.0.0", PORT),
        AppHandler,
    )

    print(f"Servidor iniciado en el puerto {PORT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()
```