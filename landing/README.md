# kie-cli landing

Project website for [`kie`](../kie/). Astro 5, static output, English at `/` and Spanish at `/es/`.

- Design: dark developer-site language (structural rails, crosshair markers, mono eyebrows),
  KIE blue as the only accent.
- The hero and closing headlines use **MaskedHeading** from
  [React Bits](https://reactbits.dev/text-animations/masked-heading) (MIT) as a React island;
  the media behind the glyphs is `public/mask.svg`, an animated gradient — no external assets.
- Copy lives in one place: `src/i18n/ui.ts`. Add a language by extending `Lang`, the `ui`
  record and adding `src/pages/<lang>/index.astro`.

```bash
npm install
npm run dev        # http://localhost:4321  (and /es/)
npm run build      # → dist/
npm run preview
```

Before deploying, set `site` in `astro.config.mjs` to the final URL (canonical + hreflang tags
depend on it). Any static host works: Cloudflare Pages, Netlify, Vercel, GitHub Pages
(`dist/` as the publish directory, `npm run build` as the build command, root `landing/`).
