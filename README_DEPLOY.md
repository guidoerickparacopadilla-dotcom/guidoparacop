# Despliegue seguro — Guido Paraco + Groq IA

## Arquitectura

La API Key de Groq **no va en el frontend**. La landing llama a este endpoint seguro:

```txt
/.netlify/functions/chat-agent
```

Ese endpoint vive en:

```txt
netlify/functions/chat-agent.js
```

El backend usa la librería oficial:

```txt
groq-sdk
```

El modelo configurado es:

```txt
llama-3.1-8b-instant
```

## Archivos importantes

```txt
index.html
servicios/
casos-de-exito/
blog/
recursos/
contacto/
geo/
netlify/functions/chat-agent.js
package.json
netlify.toml
.env.example
robots.txt
sitemap.xml
```

## Configuración en Netlify

1. Sube la carpeta `guido-site-rutas` a tu repositorio o despliegue de Netlify.
2. En Netlify entra a:

```txt
Site configuration → Environment variables
```

3. Crea estas variables:

```txt
GROQ_API_KEY=tu_api_key_de_groq
GROQ_MODEL=llama-3.1-8b-instant
```

4. Redeploy.

## Desarrollo local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` copiando `.env.example`:

```bash
cp .env.example .env
```

3. Pega tu API key en `.env`.
4. Ejecuta:

```bash
npx netlify dev
```

5. Abre la URL local que te muestre Netlify.

## Seguridad

- Nunca pegues la API Key en `index.html` ni en ningún archivo público.
- Nunca subas `.env` a GitHub.
- Si una API Key se comparte por error en un chat, documento o repositorio, lo más seguro es regenerarla en Groq y actualizar la variable en Netlify.
