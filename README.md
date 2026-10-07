# Asobigura Creator Kit

[日本語の導入手順](README.ja.md)

Build and publish browser games on Asobigura. The release ZIP includes the CLI's dependencies, the browser SDK and a save-counter example. Install Node.js 24 LTS, extract the **release asset**, and run:

```sh
node cli/bin/gameplatform.js --version
node cli/bin/gameplatform.js login --browser
```

No npm install, administrator privileges or global PATH changes are required for consumers. GitHub's automatically generated source ZIP is for contributors and does not contain installed dependencies.

This is a release candidate. Windows and macOS are tested; Linux is not currently a supported target. The CLI authenticates in your browser and stores the session in `~/.asobigura-creator-kit`, separately from the legacy CLI's `~/.gameplatform`. Existing sessions are not imported or deleted.

The SDK source is in `sdk/src`; the built script is in `sdk/dist`. The bundled sample uses a fixed SDK copy. Update that copy explicitly to take SDK fixes. The existing hosted SDK URL remains available for games that prefer it.

## Contributors

```sh
npm ci --prefix cli --ignore-scripts
npm ci --prefix sdk --ignore-scripts
npm run build --prefix sdk
node --test test/*.test.mjs
node scripts/build.mjs
node scripts/smoke.mjs
```

See [security and release checks](docs/SECURITY.ja.md) and [release procedure](docs/RELEASE.ja.md). MIT license covers the kit's own code; bundled dependencies retain their own notices. This does not license Asobigura's private platform/server code or grant unrestricted service usage.
