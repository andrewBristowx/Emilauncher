# EmiLauncher

Launcher propio para **Emipokemon / Cobbleverse**.

## Estado actual — 0.4.0 preview

La preview ya incluye:

- interfaz rosa/morado propia de Emi
- modelo grande de Emi integrado con máscaras, luces y recorte en el hero
- composición decorativa creada a partir de los emotes reales de Emi, en lugar de pegarlos como imágenes sueltas
- menos repetición del mismo chibi entre tarjetas
- botón de Ajustes junto a Cuenta Microsoft
- RAM persistente por usuario
- carpeta de instalación configurable y persistente
- preferencias locales guardadas en el PC
- noticias remotas desde GitHub
- manifiesto remoto de versión del launcher
- manifiesto inicial para el futuro actualizador del modpack
- inicio de sesión Microsoft real mediante MSAL y Device Code Flow
- sesión Microsoft persistente mediante caché local segura de MSAL
- build portable de Windows con GitHub Actions

## Inicio de sesión Microsoft

EmiLauncher usa una aplicación **public client** de Microsoft. El ejecutable no incluye Client Secret y no debe incluirlo.

El Client ID puede configurarse en:

`launcher-config.json`

```json
{
  "microsoft": {
    "clientId": "APPLICATION_CLIENT_ID"
  }
}
```

También puede publicarse en `remote/launcher.json` como:

```json
{
  "microsoftClientId": "APPLICATION_CLIENT_ID"
}
```

De esa forma se puede activar o cambiar el Client ID para todos los launchers sin recompilar el EXE.

El flujo actual abre la página oficial de Microsoft, muestra el código de dispositivo dentro de EmiLauncher y conserva la sesión después de reiniciar.

> Esta etapa autentica la cuenta Microsoft. El intercambio Xbox Live/XSTS/Minecraft y el lanzamiento real del juego se conectarán con el botón **JUGAR** en la siguiente etapa.

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
- `remote/launcher.json` — versión disponible del launcher y Client ID público de Microsoft
- `remote/pack-manifest.json` — futuro índice de archivos del modpack

La siguiente etapa conectará la cuenta Microsoft con los servicios de Minecraft y el manifiesto del pack con descargas, SHA-256, Java/Fabric y finalmente el botón **JUGAR**.
