# Guido Paraco — Deploy limpio en Netlify

Este proyecto está preparado para subirlo a GitHub y conectarlo con Netlify sin carpetas internas raras.

## Qué debe verse en la raíz del repo

Cuando subas esto a GitHub, en la primera pantalla del repositorio debes ver directamente:

- `index.html`
- `package.json`
- `netlify.toml`
- `servicios/`
- `blog/`
- `casos-de-exito/`
- `contacto/`
- `geo/`
- `recursos/`
- `sobre/`
- `netlify/functions/chat-agent.js`

No debe verse una carpeta contenedora tipo `guido-site-rutas` como único elemento principal.

## Configuración en Netlify

Cuando conectes el repo con Netlify, usa:

- Base directory: vacío
- Build command: `echo no build required`
- Publish directory: `.`
- Functions directory: `netlify/functions`

## Variables de entorno en Netlify

En Netlify agrega:

- `GROQ_API_KEY` = tu API key nueva de Groq
- `GROQ_MODEL` = `llama-3.1-8b-instant`

Después haz:

Deploys → Trigger deploy → Clear cache and deploy site

## Seguridad

No pegues la API key en ningún archivo HTML, JS ni en GitHub. Solo va en Netlify como variable de entorno.
