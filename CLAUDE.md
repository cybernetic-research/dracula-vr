# Dracula Unleashed VR: notes for Claude

*Dracula Unleashed* (Viacom New Media, 1993, DOS FMV game) played in WebXR on a Meta Quest: a Victorian study, the
disc's scenes upscaled (Real-ESRGAN x4plus) and optionally in 3D (Depth Anything V2) on a framed screen, the original's
rules read out of `DRACULA.EXE` and run by a clean-room engine. Read `README.md` (use) and `NOTES.md` (all the
reverse-engineering: disc formats, rule lists, sound ids) before changing anything.

## Rules that must not be broken

- **Copyright.** Nothing from the disc, and nothing made from it, is ever committed, published or uploaded: no video,
  sound, pictures, texts, `game.json`, media zips. Upscaled or 3D versions are still the rights holders' footage. Only
  this port's own code and art go in the repo and on GitHub Pages. `.gitignore` and the Pages workflow's check enforce
  this; keep them strict. Do not publish disc images or screenshots of disc content as Artifacts either.
- **Spoilers.** The user wants to *play* the game. Never print, summarise or hint at the schedule, routes, which scene
  happens where/when, or the solution, in chat or in notes. `game.json` holds it as machine data; checks
  (`tools/solve.mjs`, `tools/check.mjs`) print counts and "WON" only. Formats may be described, contents not.
- **The user's direction (2026-10-10):** original icons and menus feel; everything else as on the disc. Port-made
  things (study, desk, icons, map, item names) are this port's own drawings, never copied from the disc's graphics.

## Where things are

Machine-specific paths (disc image, prepared media, private previews) are in `CLAUDE.local.md`, which is not committed.
The disc image goes in `dracula/` (git-ignored); the prepared media lives outside the repo (see README).

## Code map

- `index.html`: page, import map, media panel markup. `vendor/`: three@0.186.1 (only the files used) and the IM Fell
  English font, kept locally so the game never needs the network (2026-10-23; before, they came from jsDelivr/Google).
- `src/main.js`: renderer, scene playback, the desk (tabs: map, watch, journal, items, home, menu), game flow.
- `src/engine.js`: the rules engine. `src/study.js`: the room. `src/panel.js`: canvas panels + `drawButton`.
- `src/londonmap.js`: the map card (cached canvas: Victorian roads/parks/Thames from lon/lat, cartouche, hansom cab,
  compass, ribbon). Pins and label layout (`mapGroups`) are in `main.js`.
- `sw.js` + `src/mediastore.js` + `src/mediapanel.js`: standalone play. The zip is read in slices (stored or deflated,
  ZIP64) into Cache Storage `dracula-media` under `<site>/media/...`; the service worker answers `media/...` from it,
  with 206 ranges for video, else falls through to the network (so `tools/serve.mjs --media` still works). App files
  are cached in `dracula-app-vN`: **when adding a source file, add it to `PRECACHE` in `sw.js`; bump `APP` when the
  cache layout changes.**
- `src/loadingmusic.js`: original loading music (Web Audio synth, no files), played by `mediapanel.js` during "Add media";
  follows the `dracula.music` setting.
- `tools/`: disc readers and extraction (Python), `serve.mjs` (local http/https server for the Quest on the LAN),
  `pack-media.sh`, `solve.mjs`/`check.mjs`.
- `.github/workflows/pages.yml`: deploys `index.html sw.js manifest.webmanifest icons src` on push to `main`.

Style: tabs, single quotes, plain English comments that say what and why, matching the existing density.

## Testing without a headset

Headless Edge driven over the DevTools protocol works well (service workers, Cache Storage, video). The previous
session used a small CDP script: launch `msedge --headless=new --remote-debugging-port=9333 --user-data-dir=<tmp>`,
navigate, poll `Runtime.evaluate` until the page writes a result, optionally `Page.captureScreenshot`. Serve a copy of
the site with `node tools/serve.mjs --root <dir>` (http://localhost:8080). Keep test pages and test zips in the
scratchpad, never in the repo. The real game needs the user's `game.json`, which is only on the Mac.

## Open tasks (2026-10-16)

1. ~~Publish to GitHub Pages~~ Done 2026-10-16: https://github.com/cybernetic-research/dracula-vr, live at
   https://cybernetic-research.github.io/dracula-vr/ (deployed by `.github/workflows/pages.yml` on push to `main`).
2. **Headset check** with the real media: `tools/pack-media.sh` on the Mac (parts of ~1 GB, `--flat` for no 3D), copy
   the zips to the Quest's Download folder (2026-10-16: one single multi-GB zip failed in SideQuest in its last 100 MB,
   hence the parts; each zip holds a `parts/part-i-of-n` marker and the page lists missing parts), open the Pages
   URL in Quest Browser, "Add media (.zip)". Watch for: the Quest file picker (multi-select), import speed,
   storage quota (`navigator.storage.estimate`), video seeking and 3D playback from the cache, offline start
   (airplane mode).
3. Optional: wrap as an APK for the Quest library (Meta's PWA packaging / Bubblewrap), sideloaded; the manifest and
   icons are already there.
4. Still pending from before: headset check of sound levels and of the 3D option.
5. Private alternative: `adb reverse tcp:8080 tcp:8080` + `tools/serve.mjs`, open http://localhost:8080 on the Quest.
   `Play Dracula VR.command` now does the `adb reverse` itself when a Quest is plugged in (2026-10-23). Not yet tried
   on the headset.
6. PC VR (the user's friend has a Pimax): the same Pages URL in Chrome/Edge with SteamVR or Pimax OpenXR as the
   runtime; "Add media" works on desktop too. Controllers untested beyond Quest.
