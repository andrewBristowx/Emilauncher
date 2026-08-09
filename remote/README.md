# Contenido remoto de EmiLauncher

Estos archivos se leen por Internet desde todos los launchers instalados.

## Noticias

Edita `news.json` en la rama `main`.

Cada noticia tiene:

```json
{
  "id": "nombre-unico",
  "tag": "BIENVENIDA",
  "title": "Título que verá la gente",
  "body": "Texto de la noticia.",
  "date": "2026-08-09"
}
```

Guarda el commit. No es necesario recompilar EmiLauncher. Los usuarios recibirán el cambio al abrir el launcher o pulsar **Actualizar noticias**.

El launcher muestra actualmente las dos primeras noticias del arreglo, por lo que coloca arriba las noticias más recientes/importantes.

## Versión del launcher

`launcher.json` permitirá avisar que existe una versión nueva del ejecutable.

## Modpack

`pack-manifest.json` será el índice del actualizador del pack. En la siguiente etapa tendrá entradas con ruta, URL y hash SHA-256 para que el launcher pueda descargar únicamente los archivos cambiados.
