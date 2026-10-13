# Free deployment

Use **Render Free Web Service** for the simplest complete deployment: one URL serves the game and its real-person multiplayer rooms. The included [render.yaml](render.yaml) fills in the build, start, free plan, and health-check settings.

1. Put this project in its own GitHub repository, with `package.json` and `render.yaml` at the root. Do not upload `node_modules`, test artifacts, or local `.env` files.
2. Sign in to Render, select **New > Blueprint**, and connect that repository.
3. Confirm that the service plan is **Free**, then deploy. Share the resulting HTTPS `onrender.com` address with players. No separate multiplayer URL or database is needed.

If using **New > Web Service** instead, choose Node, the Free plan, build command `npm ci --include=dev && npm run build`, start command `npm start`, and health-check path `/health`. The server reads Render's `PORT` automatically. Use one instance because rooms are currently kept in memory.

The web-service free tier uses recurring monthly allowances, rather than a fixed trial expiry. It provides 750 instance hours per workspace each month, sleeps after 15 idle minutes, and takes about a minute to wake. Active incoming WebSocket messages count as traffic. Free services can restart, ending live rooms; local single-player saves stay in the player's browser. Bandwidth and build limits also apply. Keep the Free plan and avoid adding a payment method if you want services suspended at chargeable usage limits instead of overage billing. No database is provisioned, so the separate 30-day free database expiry does not apply. Provider terms may change.

This is a free hobby/testing deployment, with limited server CPU. Eight large kingdoms or many simultaneous rooms require hosted performance validation. Free hosting does not establish unlimited capacity or uninterrupted public-game service.

The free deployment defaults to Singapore for Philippine players and one simultaneous multiplayer room to fit the small server. A room still supports up to eight kingdoms. Solo games run on each player's device and do not consume multiplayer rooms. `MAX_ROOMS` can be changed later after measuring server capacity. No account secrets or payment information are stored in the deployment file.

Sources checked 10 October 2026: [free-tier limits](https://render.com/docs/free), [WebSocket support](https://render.com/docs/websocket), [Blueprint configuration](https://render.com/docs/blueprint-spec).

## Optional Netlify frontend

Netlify can host solo/AI gameplay with the included [netlify.toml](netlify.toml): build `npm run build`, publish `dist`. A static-only build reports that online multiplayer is unavailable while solo modes continue working.

To enable multiplayer from Netlify, set `VITE_MULTIPLAYER_URL=wss://YOUR_RENDER_SERVICE.onrender.com/socket` in the Netlify build environment. On the separate Node service, set `ALLOWED_ORIGINS=https://YOUR_SITE.netlify.app`. Add any custom frontend domain as another comma-separated exact origin, then rebuild/redeploy the frontend. These are public endpoint settings, not credentials. HTTPS sites require secure `wss://` connections.

Netlify's build command and output directory follow its [official Vite guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/). The existing authoritative Node simulation remains a running web service; it is not executed by uploading `dist` to a static host.

## Make current deployment archives

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1
```

This creates versioned source and static ZIP files in `artifacts`. The source ZIP contains the game code, supplied Blender GLBs, textures, server, tests and documentation. It excludes local tools, dependencies, private environment files and test artifacts. Use this source in a separate GitHub repository for Render or a Netlify build.

The static ZIP has `index.html` at its root and can be uploaded through Netlify's manual deployment interface. It is built with the static-host setting, so solo/AI modes work and multiplayer explains that a separate server is needed. To add multiplayer, use the configured-endpoint source build described above. The archives are development/testing builds; [the release checks](RELEASE_CHECKS.md) list the remaining performance and playtesting requirements.
