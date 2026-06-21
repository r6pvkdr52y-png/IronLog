# IronLog — Deploy to GitHub Pages

This is a complete, ready-to-deploy project. Follow these steps in order.

## 1. Create the GitHub repo

1. Go to https://github.com/new
2. Name it `ironlog` (or anything you like — just remember it)
3. Keep it **Public** (required for free GitHub Pages on a personal account)
4. Don't initialize with a README — leave it empty
5. Click **Create repository**

## 2. Upload these files

Easiest method (no command line needed):
1. On your new repo's page, click **"uploading an existing file"**
2. Drag this entire folder's contents into the upload box (keep the `src/` and `public/` folders intact — GitHub will preserve the structure)
3. Commit the files

## 3. Build the project (this part needs a one-time setup)

GitHub Pages serves static files — it doesn't run `npm install`/`npm run build` for you. The cleanest free way to handle this automatically is **GitHub Actions**, which builds the project every time you push a change.

Create a file in your repo at `.github/workflows/deploy.yml` with this content (use "Create new file" in the GitHub web UI and type the path exactly as `.github/workflows/deploy.yml` — GitHub will auto-create the folders):

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

Commit that file.

## 4. Turn on GitHub Pages

1. In your repo, go to **Settings → Pages**
2. Under "Build and deployment" → **Source**, select **GitHub Actions** (not "Deploy from a branch")
3. Go to the **Actions** tab — you should see a workflow running (triggered by your commit). Wait for it to finish (green checkmark, usually 1-2 minutes).
4. Back in **Settings → Pages**, you'll now see your live URL, something like:
   `https://yourusername.github.io/ironlog/`

## 5. Add to your iPhone Home Screen

1. Open that URL in **Safari** on your iPhone (must be Safari, not Chrome, for this to work on iOS)
2. Tap the **Share** icon (square with arrow)
3. Scroll down, tap **Add to Home Screen**
4. Tap **Add**

You now have an IronLog icon that opens full-screen, no browser bar, like a real app.

## Updating later

Whenever I give you an updated `App.jsx` (or anything else), just upload the new file to the same repo (drag and drop on GitHub, or replace via "Edit"), commit it, and GitHub Actions will automatically rebuild and redeploy within a minute or two. Refresh the app on your phone to get the update — opening it again is usually enough, since the service worker checks for a fresh version online.

## If something goes wrong

- **Build fails (red X in Actions tab)**: click into the failed run, the error log will show what broke. Paste it to me and I'll fix it.
- **Page loads blank**: check the browser console (or just tell me) — likely a path issue, easy fix.
- **Icon doesn't show on Home Screen**: make sure you added it via Safari specifically, not another browser.
