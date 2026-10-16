# Nenisys Blog

Public blog front end for nenisys.shop/blog. Vite + React + TypeScript, deployed as its own Vercel project.
The marketing site (Nenisys-Site) stays untouched and rewrites `/blog/*` to this project.

```
npm install
npm run dev        # http://localhost:5174/blog/
npm run build
```

Data comes from the existing blog API (`GET /blog/posts`, `/blog/posts/:slug`) on `api.nenisys.shop`.
Set `VITE_API_URL` to point somewhere else (see `.env.example`). For local dev, add `http://localhost:5174`
to the backend's `ALLOWED_ORIGINS`.

## What is here

- `src/api.ts`: block schema (mirrors the backend), fetch with timeout, tiny in-memory cache
- `src/blocks.tsx`: block renderer. Builds React elements only, re-checks every link, embeds load after a click
- `src/components.tsx`: pill header with the N chip, footer, cards, skeletons, head tags
- `src/pages.tsx`: `/blog`, `/blog/:slug`, 404
- `src/styles/`: brand tokens copied from Nenisys-Site (Carbon + Lime, Poppins, 24px cards, pill buttons)

## Rules

- No inline styles anywhere (the CSP is `style-src 'self'`).
- Fonts are self-hosted through `@fontsource/poppins`: no Google Fonts request from the blog.
- Do not publish a real `/blog/index.html` file once the SSR function exists: a static file would win over the rewrite.

## Next

1. Marketing site: root `vercel.json` rewriting `/blog` and `/blog/:path*` to the blog origin.
2. `api/render.ts` SSR function (meta tags and a real 404 status) and `/sitemap-blog.xml`.
3. Admin editor in the Nenisys admin app.
