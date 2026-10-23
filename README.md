# Dracula Unleashed VR

*Dracula Unleashed* (Viacom New Media, 1993), the FMV mystery set in London in the last days of 1899, played in VR
from **your own disc**. You sit at a writing desk in Alexander's study; the game's filmed scenes play, upscaled, on a
large framed screen on the wall. On the desk are a map of London (travel by carriage), a pocket watch (the clock,
and waiting), the journal, the case of things you carry, and, when you are at home, the telegram tray and your bed.

Nothing from the disc is in this repository or uploaded anywhere. The tools read your disc image on your computer
and write what the game needs into a media folder outside the repo. The engine is clean-room: it runs the game's
own rules, read out of the disc's program as data (see "How it works"), not code copied from it.

What is the disc's own: every scene (video and sound), the journal pages, the telegram and address texts, the
carriage-time table, the street view of each address, and the rules (when what happens where). What is this port's
own: the study, the desk and its menus, every icon, the map drawing, the item names.

## 1. Prepare your disc (once)

You need the DOS CD as a `.bin/.cue` (MODE1/2352) or `.iso`, Python 3, Node 18+ and ffmpeg (`brew install ffmpeg`).

```sh
tools/prepare.sh "/path/to/Dracula_Unleashed.bin"          # media folder: ~/Movies/dracula-vr-media
```

This makes a Python environment in the media folder (torch, numpy, pillow, capstone, transformers, coremltools),
downloads the Real-ESRGAN x4plus weights, then writes:

| File | What |
|---|---|
| `game.json` | the rules, texts and tables, read from the disc |
| `img/loc0..12.jpg` | the 13 street views, cut from inside the original's window frame, upscaled 4x |
| `video/*.mp4` | every scene, 160x100 -> 640x400 with Real-ESRGAN x4plus (run on the Neural Engine via Core ML), H.264 + AAC |
| `video/*.3d.mp4` | the same with a depth map (Depth Anything V2 Small), for 3D (menu: Scenes 3D) |
| `sound/s*.m4a` | the 655 clips of the sound bank: the carriage driver, the spoken journal, the watch, Van Helsing's guide, music |

The videos take about 3 hours on an Apple Silicon Mac, the 3D versions about 4 more; re-running skips what is
already done. At the end it runs
`tools/solve.mjs`, which checks that the game can be finished with the extracted rules (it prints only "WON" or not,
nothing about the route).

## 2. Play

**Easiest:** double-click **`Play Dracula VR.command`** (Mac) or **`Play Dracula VR.bat`** (Windows). It starts the
game server, opens the game in your browser, and prints the address to open on the Quest. Close the window to stop it.
It looks for the media folder in `~/Movies/dracula-vr-media` (Mac) or `%USERPROFILE%\Videos\dracula-vr-media`
(Windows); set `DRACULA_MEDIA` to use another place. Windows: `prepare.sh` needs a Mac or Linux shell, so prepare the
media there (or in WSL) and copy the folder over; the Quest's https certificate needs openssl, which Git for Windows
includes; allow Node.js on private networks when Windows asks.

By hand:

```sh
node tools/serve.mjs --https --media ~/Movies/dracula-vr-media
# then open https://<your-computer's-lan-ip>:8443 on the Quest and accept the certificate warning
```

With `--https` the server also answers at http://localhost:8080 on the computer itself (flat-screen play with the
mouse); `--open` opens that in your browser. The server shares your media folder with anyone who can reach it: only run it on
your own network.

### On the headset alone (no computer)

The game can also run entirely on the Quest, from the published page (GitHub Pages: only this repo's code is there,
never anything from a disc), with your media stored in the headset's browser:

1. On the computer that prepared the media: `tools/pack-media.sh` writes `dracula-media-1-of-N.zip`, `-2-of-N.zip`, ...
   (game.json, img/, sound/, video/, in parts of about 1 GB: one multi-gigabyte file tends to fail near the end when
   copied to a Quest; `--size <MB>` changes the part size, `--flat` leaves out the 3D scenes, about half the size).
   Never share or upload these zips.
2. Copy the zips to the headset's **Download** folder (SideQuest, `adb push`, or the Quest as a USB drive on Windows).
3. In the Quest Browser, open the game's page and press **Add media (.zip)**, then choose the zips (together, or one at
   a time: the page says which parts are still missing). They are copied into the browser's storage on the headset;
   the zips in Download can be deleted afterwards. While they copy, the port's own loading music plays (an organ, a bell and wind in a
   stone hall, made live in the browser; a button turns it off).

From then on the page works with no computer and no network (open it once while online after an update to get the new
version). The panel at the top right shows what is stored and can remove it. Clearing the Quest
Browser's site data removes the media too.

### With no internet (travelling)

Everything the game needs is in this repo or in your media folder: three.js and the IM Fell English font are kept in
`vendor/` (MIT and SIL OFL licences), so nothing is fetched from the internet. Two ways to play with no network:

- **Quest on its own:** do the "On the headset alone" steps above at home, then open the page once more while
  online and put the page on the Quest's home screen if you like. Before leaving, switch on airplane mode and check
  that the page still opens and a scene plays.
- **Laptop (Mac) with the media folder:** double-click `Play Dracula VR.command` and play on the screen; or plug the
  Quest into the laptop with a USB cable (developer mode on, `brew install android-platform-tools` for `adb`): the
  launcher then sets up `adb reverse` and you open http://localhost:8080 in the Quest Browser. No Wi-Fi is involved.

### Controls

| | VR | Desktop |
|---|---|---|
| Use the desk | point a controller, pull the trigger | click |
| Journal pages | thumbstick up/down | mouse wheel |
| Face the screen again | click a thumbstick | R |
| During a scene | rewind 10 s, pause, forward 10 s, skip (on the desk) | same |

### How to play (the original's rules)

- **Map**: choose an address you know and go there by carriage. The trip takes the time in the original's
  carriage table (5 minutes within a district, up to an hour across London). What happens there depends on the
  time, on what you have already seen, and on what you carry.
- **Items**: you can take one thing with you. Choose it before you set off.
- **Watch**: pass time where you are (5 minutes to 12 hours), then the address is looked at again.
- **At home**: read the telegrams that have arrived; go to bed. You sleep 5, 8, 10 or 15 hours depending on how long
  you have been awake, and staying awake for two days is fatal.
- **Menu**: new game, continue (the game saves itself after every step), three save slots; voices and music on/off; scenes 3D or flat (3D,
  the default: the scene opens up behind the frame, with depth; also switchable during a scene, under its controls); Van Helsing's spoken guide on/off.
- **Sound**, as on the disc: the carriage driver greets you, repeats where you are going and announces the arrival; the
  watch speaks the time you set; the journal reads itself aloud when you open it (and only then is the newest page
  written down for good); each item is described when you pick it.

## How it works

- `tools/iso.py`, `tools/dta.py`: read the disc image and the game's `.DTA` archives.
- `tools/umv.py`: decodes the `.UMV` scenes (picture and sound).
- `tools/extract_game.py`: reads `DRACULA.EXE` (a DOS/4GW LE program) and walks every rule function, path by path,
  into data; plus the texts and tables. Needs `capstone` (disassembler).
- `src/engine.js`: runs the rules exactly as the original program does around them (which list runs when: arriving,
  travelling, waiting, sleeping, the telegram tray, the epilogue after a win).
- `tools/solve.mjs` and `tools/check.mjs`: spoiler-free checks of the extracted rules.
- `tools/upscale.py`: the upscaling (videos, and the street views with `PICTURES`).
- `src/main.js`, `src/study.js`, `src/panel.js`, `src/icons.js`, `src/input.js`: the VR study, the desk, the icons.
- `src/londonmap.js`: the map on the desk (this port's own Victorian travel guide of London).
- `src/loadingmusic.js`: the music while the media is copied in: this port's own, synthesized with Web Audio (an organ
  playing the opening of Bach's Toccata and Fugue in D minor, which is public domain, then bell, wind, thunder).
- `sw.js`, `src/mediastore.js`, `src/mediapanel.js`: running without a computer: the media zip is imported into the
  browser's storage and the service worker answers the game's `media/...` requests from it (with byte ranges for video);
  the game's own files are cached so it starts offline. `tools/pack-media.sh` makes the zip.
- `.github/workflows/pages.yml`: publishes the code (never media) to GitHub Pages on a push to `main`.

The research notes are in [NOTES.md](NOTES.md).

## Not done yet

- Headset check of "Add media" with the real media zip (tested in desktop Edge with test zips: ZIP64, byte ranges, video
  seeking through the service worker).
- Headset check of the sound levels and of the 3D option.
