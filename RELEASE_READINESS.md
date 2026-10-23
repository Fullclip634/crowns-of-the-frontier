# Production package readiness

The game previously returned `{ok:true}` from `/health` even when the frontend
package was missing or stale. A deployment status therefore could not identify
which game revision the public service actually served. During verification of
`f6e7f74`, Render reported success while fresh uncached public requests still
returned the previous bridge build and an older multiplayer protocol. The cause
of that hosting mismatch has not been established by the code change below.

The build now emits `release.json` with the build ID, package version, validated
deployment commit when available, entry script/hash and required asset files.
Build completion validates the package. The Node host checks it again at boot,
including the HTML and update-version IDs, file presence and entry hash. On Render,
its runtime commit must match the built commit. Missing or inconsistent packages
fail startup; the underlying HTTP app also returns uncached 503 responses and
rejects WebSocket upgrades when unready. A valid health response includes only
public version details, not the environment or credentials.

This uses Render's documented [`RENDER_GIT_COMMIT`](https://render.com/docs/environment-variables),
available at build and runtime, and [HTTP readiness checks](https://render.com/docs/health-checks).
It verifies package consistency and reports revision identity. It is not a signed
software attestation, a substitute for a real browser/multiplayer check, or proof
that a hosting dashboard is configured for the intended service.

`node --use-system-ca scripts/verify-release.mjs GAME_ORIGIN EXACT_COMMIT_SHA`
checks the actual public responses for matching server/release/update/HTML
metadata and validates the entry bytes. It exits nonzero on a mismatch.

Regression coverage in `tests/release.test.js` uses real HTTP/WebSocket servers
and temporary valid/broken packages: missing chunks, changed code, mismatched
commits, wrong HTML/update IDs, malformed manifests, rejected room upgrades and
successful hosting. The production browser multiplayer check now uses the same
HTTP app as `npm start`, rather than a separate static-file implementation.

The local candidate passed 486 regression tests, a production build validating
57 required files, and a rendered Chrome155 Huge eight-kingdom check covering
allied scouting, omitted-update recovery, touch training and reload/rejoin.
See [verification](artifacts/readiness-verification-20261024.json) and
[browser report](artifacts/readiness-multiplayer/report.json). Its gameplay entry
hash matches the preceding visibility release; this changes hosting/readiness,
not graphical detail. The configuration remains on Render's Free plan with one
simultaneous room. Public deployment verification is a separate required step.

The remaining game-wide requirements are tracked in [QUALITY_TARGETS.md](QUALITY_TARGETS.md).
