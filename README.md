# Dune Weaver Installer

A web based tool to install and configure the
[Dune Weaver firmware](https://github.com/tuanchris/dune-weaver-firmware) — a fork of
[FluidNC](https://github.com/bdring/FluidNC) for the
[Dune Weaver](https://github.com/tuanchris/dune-weaver) kinetic sand table. It is a fork
of [breiler/fluid-installer](https://github.com/breiler/fluid-installer).

The installer flashes firmware over WebSerial and lets you manage the controller's
config, files and WiFi from the browser.

## Where it gets the firmware

Both sources live in the firmware repo `tuanchris/dune-weaver-firmware`
(configured in `src/services/GitHubService.ts`):

- **Release list** — the GitHub Releases API. The dropdown shows each release's
  name; the binaries are addressed by its **tag** (`tag_name`).
- **`manifest.json` + firmware binaries** — committed in the firmware repo under
  `releases/<tag>/` on `main`, served via `raw.githubusercontent.com`.

> **Why committed files and not GitHub release assets?** The browser fetches these
> files cross-origin, so the host must send CORS headers. `raw.githubusercontent.com`
> does (`access-control-allow-origin: *`); GitHub **release-asset** downloads do
> **not**, so attaching the binaries to a GitHub Release is not enough on its own.

For a release to be installable, `releases/<tag>/` must contain an
installer-compatible `manifest.json` (its `images[].path` values are flat
filenames) plus the matching `*.bin` files. The firmware's `build-release.py`
already emits exactly this layout in `release/current/`.

Optional config templates are read from `tuanchris/dune-weaver-firmware-config-files`
(structured as `contributed/<board>/*.yaml`); until that repo exists the template
picker is simply empty.

## Building

```
npm install
npm run build
```

## Developing

Start a development server, then open http://localhost:1234/

```
# Remove build cache
rm -r .parcel-cache

npm install
npm start
```
