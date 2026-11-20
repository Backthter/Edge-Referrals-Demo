# Edge Referrals demo

Clickable prototype of the Edge Referrals system (Referral Rock replacement), exported from the Claude design canvas as static pages.

| Page | What it is |
|---|---|
| `index.html` | Admin console (all regions) — entry point |
| `portal.html` | Referrer portal · client referrals · candidate page |
| `review.html` | Critical review against policy v1.0 |
| `blueprint.html` | System blueprint |

The Admin / Member switch at the top of the prototype links `index.html` and `portal.html`. The review and blueprint pages are standalone (open them by URL).

## How it works

- Each page holds its original design template (`<script type="text/x-dc-template">`) and logic (`<script type="text/x-dc">`).
- `dc-lite.js` renders them with **React 18** (loaded from cdnjs). No build step.
- All data is fake demo data held in the browser; nothing is saved or sent anywhere.

## Host on GitHub Pages

1. Create a new repository on GitHub and upload every file in this folder (including `.nojekyll`).
2. Repository **Settings → Pages** → Source: *Deploy from a branch* → branch `main`, folder `/ (root)` → Save.
3. After a minute the site is at `https://<your-username>.github.io/<repo-name>/`.

## Run locally

Opening `index.html` directly works in most browsers. Or serve the folder:

```
npx http-server . -p 8642
```
