---
name: testing-mendadice-live
description: Test the Mendadice GitHub Pages app against the Verse8 Agent8 backend. Use when verifying production deploys, Agent8 verse/account configuration, or connection retry behavior.
---

# Mendadice Live Testing

## Target

- Live app: `https://bloonicious.github.io/Mendadice/`
- Verse8 game ID expected as Agent8 `verse`: `W3u3h5L`
- Creator wallet expected as Agent8 `account`: `0x169ffbc90b1d59f79a98b1f7c4a1d0b48e5b7e4d`
- Expected backend URL: `wss://verse8-game-backend-kr-609824224664.asia-northeast3.run.app`

## Devin Secrets Needed

- None for public live-page testing.
- GitHub repo access is only needed for PR/comment operations and should already be available through Devin git tooling.

## Runtime Verification Flow

1. Open Chrome DevTools Console and navigate to `https://bloonicious.github.io/Mendadice/?devin-live-test=<timestamp>` to avoid confusing old page state with a fresh load.
2. Verify the app shell loads and the initial disconnected card says exactly `CONNECTING TO SERVER...` with body text `Connecting to the Mendadice Verse8 game server.`
3. Inspect the first console line beginning with `connect false`.
   - Passing shape: `connect false W3u3h5L 0x169ffbc90b1d59f79a98b1f7c4a1d0b48e5b7e4d wss://verse8-game-backend-kr-609824224664.asia-northeast3.run.app`
   - Failing shapes include `connect false default ...`, `connect false Mendadice ...`, or any value beginning with the wallet address in the `verse` position.
4. If a deployment freshness check is needed, fetch the loaded `assets/index-*.js` from the page and inspect the baked Vite env/config. For the wallet-prefixed guard, the deployed bundle should include the broad regex `/^0x[a-fA-F0-9]{40}/` and not the exact-only regex `/^0x[a-fA-F0-9]{40}$/`.
5. If the backend remains disconnected, wait at least 16 seconds. The UI should change to `SERVER STILL CONNECTING` and display a `RETRY CONNECTION` button.
6. Click `RETRY CONNECTION`. The page should reload and emit a fresh `connect false W3u3h5L ...` console line.

## Local Build Verification

Use this command to reproduce the live misconfiguration locally and verify the guard falls back to `W3u3h5L`:

```bash
VITE_AGENT8_ACCOUNT=0x169ffbc90b1d59f79a98b1f7c4a1d0b48e5b7e4d \
VITE_AGENT8_VERSE=0x169ffbc90b1d59f79a98b1f7c4a1d0b48e5b7e4d-1777664313597 \
npm --prefix /home/ubuntu/repos/Mendadice run build
```

Then inspect `dist/assets/index-*.js`; the production config should evaluate to `verse: "W3u3h5L"` with the wallet only as `account`.

## Useful Commands

- Frontend build: `npm --prefix /home/ubuntu/repos/Mendadice run build`
- Server build: `npm run build --prefix /home/ubuntu/repos/Mendadice/server`
- Server tests: `npm test --prefix /home/ubuntu/repos/Mendadice/server`
- Lint note: `npm --prefix /home/ubuntu/repos/Mendadice run lint` may fail if `eslint` is not installed in repo dependencies.
