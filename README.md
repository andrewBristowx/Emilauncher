# EmiLauncher

Launcher propio para **Emipokemon / Cobbleverse**.

## Estado actual — 0.2.0 preview

La preview ya incluye:

- interfaz rosa/morado propia de Emi
- emotes integrados en la decoración
- botón de Ajustes junto a Cuenta Microsoft
- RAM persistente por usuario
- carpeta de instalación configurable y persistente
- preferencias locales guardadas en el PC
- noticias remotas desde GitHub
- manifiesto remoto de versión del launcher
- manifiesto inicial para el futuro actualizador del modpack
- build portable de Windows con GitHub Actions

El inicio de sesión Microsoft y el lanzamiento real de Minecraft todavía no están conectados. Para Microsoft necesitaremos registrar la aplicación y usar su Client ID oficial; no se incluirán secretos dentro del launcher.

## Publicar una noticia

Las noticias que ven todos los launchers están en:

`remote/news.json`

El propio launcher tiene un botón **Editar noticias** que abre ese archivo en el editor web de GitHub. Solo una cuenta con permisos sobre este repositorio puede guardar cambios.

Ejemplo:

```json
{
  "id": "bienvenida",
  "tag": "BIENVENIDA",
  "title": "¡Bienvenidos a Emipokemon!",
  "body": "Texto que aparecerá en todos los launchers.",
  "date": "2026-08-09"
}
```

Después de guardar el commit en `main`, los jugadores reciben la noticia al volver a abrir el launcher o al pulsar **Actualizar noticias**.

## Archivos remotos

- `remote/news.json` — noticias
- `remote/launcher.json` — versión disponible del launcher
- `remote/pack-manifest.json` — futuro índice de archivos del modpack

La siguiente etapa conectará el manifiesto del pack con descargas, SHA-256, instalación de Fabric/Java y finalmente el botón **JUGAR**.
