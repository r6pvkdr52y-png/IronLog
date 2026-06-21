# IronLog — Deploy to GitHub Pages (flat version)

This version has **no subfolders** — every file sits at the top level, so uploading via GitHub's mobile web interface is simple drag-and-drop with no renaming needed.

## 1. Clear out the old upload (if you already started)

If you previously uploaded files with names like `src:App.jsx` or `public:icon-512.png`, remove those from the upload box (tap the **X** next to each) before continuing — we don't need them anymore.

## 2. Upload these files

You should have exactly these files:
- `index.html`
- `package.json`
- `vite.config.js`
- `App.jsx`
- `main.jsx`
- `icon-192.png`
- `icon-512.png`
- `manifest.json`
- `sw.js`
- `README.md` (this file — optional to upload, just for your reference)

On your GitHub repo page, use **"uploading an existing file"** (or "choose your files" / drag-and-drop), and add all of these at once. Since there are no folders this time, there's nothing to rename — whatever name shows up is correct.

Scroll down to **Commit changes**, leave the default message, and tap the green **Commit changes** button.

## 3. Add the GitHub Actions build file

GitHub Pages serves static files only — it doesn't run `npm install`/`npm run build` for you. We use GitHub Actions to do that automatically on every upload.

In your repo, tap **"Add file" → "Create new file"**. For the filename, type exactly:

```
.github/workflows/deploy.yml
```

(GitHub will automatically create the `.github` and `workflows` folders for you when you type a path with slashes in the **filename box** — this is different from the upload box and handles slashes correctly.)

Paste this content into the file body:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Commit this file (same green button at the bottom).

## 4. Turn on GitHub Pages

1. Go to **Settings → Pages** in your repo
2. Under "Build and deployment" → **Source**, select **GitHub Actions**
3. Go to the **Actions** tab — a workflow run should already be in progress (triggered by your last commit). Wait for the green checkmark (1-2 minutes).
4. Back in **Settings → Pages**, your live URL will be shown, e.g.:
   `https://yourusername.github.io/ironlog/`

## 5. Add to your iPhone Home Screen

1. Open that URL in **Safari** (must be Safari on iOS)
2. Tap **Share** → **Add to Home Screen** → **Add**

## Updating later

To push an update, just upload the changed file(s) again the same way and commit — GitHub Actions rebuilds and redeploys automatically within a minute or two.

## If the build fails

Open the **Actions** tab, click the failed (red X) run, and copy the error text from the log — send it to me and I'll fix it.
