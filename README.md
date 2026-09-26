# Menologion — Orthodox Calendar (Julian)

A home-screen web app for iPhone showing, for each day of the Russian Orthodox (old) calendar:
fasting rule, commemorated saints (with icons, lives and troparia), scripture readings (full KJV text)
and troparia/kontakia.

- `app/` — the static web app (GitHub Pages).
- `worker/` — a Cloudflare Worker that fetches and parses the sources live:
  - [Holy Trinity Russian Orthodox Church calendar](https://www.holytrinityorthodox.com/htc/orthodox-calendar/) — commemorations, fasting, readings, hymns, lives
  - [orthocal.info](https://orthocal.info/) — Julian-calendar API, full KJV scripture text
  - [Orthodox Church in America](https://www.oca.org/saints/lives) — icons, and lives/troparia where Holy Trinity has none

No source text is stored in this repository; it is fetched on demand.

## Local development

```bash
cd worker && npm install && npx wrangler dev --port 8787
node serve.js 5173
```

## Deploy

- Worker: `cd worker && npx wrangler deploy`
- App: push to `main`; the Pages workflow publishes `app/`.
