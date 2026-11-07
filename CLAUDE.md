# Apex

React running app (Create React App). Two Netlify builds from this repo:
- **Owner site** (no env flag): Caleb's personal app. Never break it.
- **Public site** apexrunning.app (`REACT_APP_PUBLIC=true`): accounts via Supabase, Stripe Pro (£4.99/month).

Caleb commits and pushes with GitHub Desktop. Commit locally when a change is done; don't push.
Keep instructions to Caleb short and step by step; he isn't a developer.

## Build and check
- Public preview with sample data: `REACT_APP_PUBLIC=true REACT_APP_APEX_PREVIEW=true CI=true BUILD_PATH=<scratch> npx react-scripts build`, serve the folder, open `/?new`, `/?free`, `/?connect`, `#activity`, `#profile`, etc.
- `CI=true` builds fail on lint warnings, so always build before committing.

## Where things are
- `src/App.js`: sign-in gate, onboarding, then `ApexApp`. Runs come from ONE source at a time (`src/runSources.js`: Strava, COROS, WHOOP) and duplicates are folded (`dedupe`). No Strava wall: new runners pick a source or skip (`ConnectRuns` in `src/ApexSignIn.js`).
- Recovery sources: `src/recoverySources.js` (WHOOP, Oura, Google Health). COROS: `src/coros.js` (official COROS MCP).
- Plans and paywall: `src/apexPlan.js`, `src/ApexPro.js`, Settings `ProRow`. Netlify functions in `netlify/functions/`.
- Setup docs: `PAYMENTS-SETUP.md`, `HEALTH-SETUP.md`, `SIGN-IN-SETUP.md`, `LAUNCH.md`.

## iPhone app (`ios/`, Capacitor 8)
- Native shell that loads the live https://apexrunning.app (`capacitor.config.json`), so web deploys reach it instantly. Bundle id `app.apexrunning.ios`, iPhone portrait only, Apex icon and launch screen in `ios/App/App/Assets.xcassets`.
- Behaves exactly like the website (Stripe and Google kept; it's for Caleb's own testing, not the App Store yet).
- After changing `capacitor.config.json`, run `npx cap sync ios`.
- Open in Xcode: `ios/App/App.xcodeproj`. Signing team `WGCFQDWQMG` (Caleb's personal team).

## Marketing (separate folder)
Ad pages and render tools live in `/Users/calebcunn/Downloads/apex-brand/src` (`vids/*.html` with `render(t)`, `render-video.mjs`, `zoom-fit.mjs` + `zoomize.sh` + `zoom-all.sh` for TikTok-safe zoom-out). Finished ads go to `~/Desktop/Apex Brand/<numbered folder>/` with a `Captions.txt`.
