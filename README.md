# Mis tareas

## Iniciar la aplicación

Desde esta carpeta ejecutá:

```bash
python3 server.py
```

Después abrí:

```text
http://localhost:8000/tareas.html
```

La aplicación usa SQLite (`app.db`) y una API para compartir tareas, stock y gastos entre navegadores. En Render, el servidor usa automáticamente el puerto asignado mediante la variable `PORT`.

Cuando las vistas se publican en GitHub Pages, utilizan automáticamente la API pública:

```text
https://administracionsr.onrender.com
```

Para conectarte desde otro dispositivo en la misma red Wi-Fi, buscá la IP de la computadora que ejecuta el servidor y abrí:

```text
http://IP-DE-ESTA-COMPUTADORA:8000/tareas.html
```

El servidor debe permanecer ejecutándose y el firewall debe permitir el puerto `8000`. La sincronización de cambios se revisa automáticamente cada tres segundos.
