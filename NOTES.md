# Dracula Unleashed VR: research notes

Started 2026-10-04 (video decoder). 2026-10-10: game logic decoded from DRACULA.EXE, engine, VR study, upscaling.

> **Status (2026-10-11):** playable start to finish; tried in the Quest by the user (screen size, room, desk position
> agreed). Rules checked winnable (`tools/solve.mjs`). Sounds decoded and wired (below). 3D scenes as an option.

## Goal
Play *Dracula Unleashed* (Viacom New Media, 1993) in VR: an FMV game where you visit addresses in 1899 London against
the clock and watch filmed scenes. You sit at a Victorian desk (map, pocket watch, journal, item case, telegram tray);
scenes play upscaled in a framed screen. User's direction (2026-10-10): **original icons and menus; everything else as
on the disc**; upscale as in the Starblade port.

## Disc (the user's own DOS CD)
`dracula/Dracula_Unleashed.bin` (in this folder, git-ignored): MODE1/2352, ISO9660, volume `DRACULA`. 172 files.

| File | What it is |
|---|---|
| `D*.UMV`, `DK*`, `DN*`, `DS*`, `DR*`, `DP1`, `DD1` (142 files) | Scenes: 160×100, 15 fps, 22,050 Hz 8-bit mono. One file = one scene |
| `DOPEN.UMV`, `DEND.UMV` | Opening and ending: 256×182 (named in RESOURCE.DTA) |
| `*.DTA` | Archives, all the same format (below) |
| `DRACULA.EXE` | DOS/4GW LE program: the engine **and the rules** |
| `GRAPHICS.VGA`, `RESOURCE.VGA` | The VGA-mode versions of the graphics/UI |
| `WVDEMO/`, `SETDRAC.EXE`, `UNIVESA.*`, `DEMO.*` | Installer, a demo of another game, VESA driver, self-running demo data |

### .DTA archives (`tools/dta.py`)
Big-endian. `u32` directory offset; items; directory = `u16 nIds, u16 nItems, u16 n3`, then `nIds × u16` id→item map
(`0xffff` = none), then `u32` item offsets (absolute; the last equals the directory offset). The program asks for
**ids**, so always go through the map (JOURNAL has 115 ids for 114 items).

| Archive | Items |
|---|---|
| `ADDRESS` (13) | "Name - number street, district" (Mac Roman text, NUL-terminated) |
| `TELEGRAM` (10) | "Sender MM/DD": the labels of the telegram tray |
| `JOURNAL` (115 ids) | `u16 n`, `n × u16` picture refs (4 pages have them), then the text |
| `TEXTS` (69) | carriage-time sentences (8×8), and the save/quit/died/won dialog texts |
| `SCENES` (164 ids) | scene id → `.umv` file name (`d65d.umv` is named but not on the disc) |
| `RESOURCE` (531) | archive names, item 9 = district of each address, item 10 = 8×8 carriage minutes, then UI: screens, buttons (42-byte records: graphic ids, rectangles, keyboard shortcut), the opening/ending names |
| `GRAPHICS` (1030) | images: `u16 stride, width, height, 0` + 8-bit pixels. Palettes: `u16 count, 3 bytes`, then `count` RGB triplets (8-bit) from index 0 (index 0 = magenta key). A palette comes before the images it colours |
| `SOUNDS` (655) | `u32 rate (22050), u32 0`, 8-bit unsigned mono. 54 minutes, mostly clips under 5 s |
| `FONTS` (9) | bitmap fonts |

GRAPHICS layout notes: items 91 + 24k (k = 0..12) are the palettes of the 13 street-view screens, 92 + 24k the 640×480
screens; the picture sits inside the UI frame at about (104,62)–(536,352), but the frame's corner ornaments reach in,
so we keep (112,84)–(478,352). The 13 are stored Home first, then alphabetically by short name (Annisette, Asylum,
Bookstore, Cemetery, Hades, Harker, Holmwood, Newsstand, Office, Pub, Telegraph, University). Items 509–536 = the
original item icons (54×53, palette item 52; 509 = empty slot) — **not used**, the port draws its own.
The carriage screen ("Concise Guide to Travel Times", a street map of London) is item 540 (416×248 at (112,80)),
coloured by item 539: a partial palette, `u16 count, 3 bytes`, two triplets for indices 0-1, then `u16 start` (146)
and triplets from there, over the UI palette (item 52). District labels: items 545-560 (normal/lit pairs), placed by
RESOURCE records 178-185 (graphic id = item + 1, then x, y at +30). **Not used**: the port draws its own map in the
same manner (`src/londonmap.js`, 2026-10-16).

## Video (`tools/umv.py`)
Format per https://wiki.multimedia.cx/index.php?title=UMV, plus our findings: each frame's audio is `rate/fps` bytes at
group start + the frame's audio offset (audio packets carry lead-in); unchanged frames are omitted (repeat the last
picture, take its audio from just before the next frame's). Packet `0x08` (16,020 bytes) = full keyframes for seeking
("shuttle"), `0x80` = empty markers. No branching inside a file.

## Game logic (decoded)
The rules are **compiled C inside DRACULA.EXE**, not data files. `tools/extract_game.py` loads the LE executable
(objects at link bases, 32-bit fixups applied) and walks each rule function path by path with capstone.

**Rule lists** (NULL-terminated pointer lists in the data object):

| Address | List | When the engine runs it | Clock copy |
|---|---|---|---|
| `0x7108c` (13 lists) | arrive | on arriving at address *n*, and after waiting there | `0x73278` |
| `0x7110c` | travelGlobal | on every trip, before arriving (deaths and on-the-way events) | `0x73280` |
| `0x71144` (13 lists) | travel | on a trip to address *n* (random encounters) | `0x73280`, roll `0x7327c` |
| `0x71178` | sleep | going to bed at home | `0x73284` |
| `0x7118c` | telegrams | opening the telegram tray: **every** rule runs, each may add an entry | `0x73288` |
| `0x711b4` | epilogue | after a winning scene | `0x73290` |

Each dispatcher sets its clock copy (and a 0–99 random roll) then calls the rules in order until one returns 1
(the telegram list calls all). Each rule is a chain of tests then calls:

| Helper | Meaning |
|---|---|
| `0x236e8(n)` | test flag *n*. Flags are one byte per scene id (164): "scene *n* has been played" |
| `0x23700(n)` | set flag *n* |
| `0x23718(n)` / `0x237c4(n)` / `0x237e4(n)` | queue scene *n* / queue it as a death / as a win |
| `0x1c12c(n)` | is item *n* the one carried? (one carry slot) |
| `0x1c2b0(n)` / `0x1c42c(n)` | gain item *n* / lose it (items 1–27; 24 owned slots) |
| `0x1ed44(n)` | learn address *n* (you start knowing 0–5) |
| `0x1ec58(n)` | add journal page *n* (dated with the clock) |
| `0x130e4(m)` / `0x130fc(t)` | add *m* minutes / set the clock |
| `0x237b8()` / `0x237ac()` | note the waking time / minutes since |
| `0x28bc0(n, fn)` | add telegram-tray entry *n* (label = TELEGRAM.DTA *n*), *fn* runs when it is read |

Clock: minutes since 1 January (the year is never shown; weekdays match 1899). New game (`0x23830`): address 0,
the first four journal pages with their back-dated dates, six known addresses, items 1–4, clock 28 Dec 07:00.
Sleeping (`0x1bb7c`): only when a sleep rule fires; then 5/8/10/15 h for ≤24/≤36/≤48/more hours awake.
Waiting: the pocket-watch widget (`0x128f8`) sets a later time in 5-minute steps; then the address is looked at again.
Carriage: travel minutes = matrix[district(here)][district(there)] (`0x1af2c`).

Flags required but never set (15) are all "a death has been seen" guards; harmless.

Checks: `tools/solve.mjs` (backward-chaining planner, executed in the real engine: all endings reachable, epilogue
plays) and `tools/check.mjs` (go-explore coverage). Both print counts only.

## Spoiler policy (the user's request)
The user wants to **play** this one. The schedule stays machine data in the local `game.json`: never printed to chat
or summarised in notes; only formats are described here. Checks print counts and "WON", never routes. (2026-10-10:
the user allowed using `research/` (walkthrough, videos) as a reference; it was used only for the list of player
verbs. Everything above was read from the program.)

## Upscaling
First pass (2026-10-10) as Starblade: Real-ESRGAN general-x4v3. Compared on faces (2026-10-11), **x4plus** (RRDBNet,
23 blocks) is clearly better: it keeps faces natural where general-x4v3 makes them waxy. x4plus with PyTorch on MPS is
~0.43 s/frame (fp16), too slow for 91,340 coded frames; converted to Core ML (fp16, batch 4, one model per frame size,
cached in `models/`) it runs on the **Neural Engine at ~0.1 s/frame** (PSNR 53 dB against the fp32 reference), so it
can run while the GPU makes the 3D versions. 160×100 → 640×400, identical frames upscaled once, H.264 CRF 16 slow + AAC.
Converting x4plus to Core ML for another frame size needs ~10 GB and ran the Mac out of memory (2026-10-11), so the
256×182 opening/ending and the street views go through the one 160×100 model in overlapping tiles, blended with
weights that fall off towards each tile's edges (no visible seams).

## Sounds (decoded 2026-10-10)
Archives are numbered by their place in the handle table the program registers (`0x31a34(0x73134, 8)`): 0 RESOURCE,
1 GRAPHICS, 2 TEXTS, **3 SOUNDS**, 4 FONTS, 5 ADDRESS, 6 JOURNAL, 7 TELEGRAM; `0x31a88(n)` returns handle *n*. Screens
play a clip by sending message `0x41` with `{u16 id, u16 archive}` to the global sound player `[0x72ff8]` (or a
playlist). The bank is laid out by purpose (ids; classified by transcribing every clip locally, checked against the
code and the bases stored in RESOURCE):

| Ids | What | When (where in the program) |
|---|---|---|
| 0-4 | five ~2-minute music pieces | a random one when the main screen comes back (`0x13c96`: base + rand(count), music option `[0x72fa8]`) |
| 5 | Alexander on the map | the map screen (`0x154ea`) |
| 6-69 | "It will take me *n* minutes to go from A to B": 6 + from×8 + to (districts) | map screen, on a district (`0x14dbc`) |
| 70-80 | Van Helsing's guide: introduction, then one line per control | help screen (`0x172b0`, `0x1784d`: ids pushed as constants) |
| 81 + item | Alexander describing item 1-27 | the satchel (`0x186ac`) |
| 109, 110 | journal / address book help | (`0x1a521`) |
| 111 + page | the journal page read aloud | journal screen; RESOURCE item 220 field +0xe |
| 226 + address | the address book entry read aloud | same record, field +0x10 |
| 239 + h×12 + m/5 | the time spoken (12:00 am ... 11:55 pm) | the pocket watch, when you set it (`0x128f8`) |
| 527-651 | the carriage: greetings, the destination, arrival, goodbyes | carriage screen (`0x1a9df`-`0x1acd8`), below |
| 652, 653 | Van Helsing on winning / dying | the game-over dialog (`0x2a63e`) |

Carriage (RESOURCE bases `527 563 576 579 607 627 630 632` right after the district and travel tables): a driver
`d` is chosen at random (0-3) when the screen opens. Boarding: `527 + 9d + (18-23 h ? 6 + rand 3 : rand 6)`. Setting
off: `563 + address`, then `632 + 5d + rand 5`. Arriving: `563 + address`, `576 + rand 3`, `579 + 7d + rand 7`.
Leaving without going: `630 + rand 2`, or (after a destination) `627 + rand 2` (+2 in the evening) then
`607 + 5d + rand 3` (+3 in the evening).

Journal: a new page is undated; while the newest page is undated, a newer one replaces it (`0x1ec58`). Opening the
journal dates it (`0x197d4` → `0x1ec10`) and reads it aloud. The 4 pages with "refs" refer to other journal pages
(0-11), not pictures.

## 3D
`tools/depth3d.py`: Depth Anything V2 Small on each upscaled frame, levels that follow slowly and restart at cuts,
packed as picture-over-depth in `video/<name>.3d.mp4`. In the game (`src/depthscreen.js`, menu: Scenes 3D / Flat, 3D by default; also under the scene controls, switching in place) the
picture is a mesh pushed back along the lines from the seat, into an alcove behind the frame whose walls follow the
same lines: from the seat it lines up with the frame exactly; leaning gives parallax.

## Still to do
- Headset testing (Quest Browser): layout of the desk, ray readability, video texture performance.

- Assumptions to confirm against the reference footage: after an on-the-way event that is not a death, you still
  arrive (we run the arrival rules); waiting re-runs the arrival rules.

## Standalone (no computer), 2026-10-16
The media zip (tools/pack-media.sh) is imported into Cache Storage on the device and served to the game by sw.js
(byte ranges for video). Tested in headless Edge with stored, deflated and ZIP64 test zips and a real H.264 file
(play + seek). Not yet tried on the Quest. Deployment: GitHub Pages, code only (.github/workflows/pages.yml).

## Legal ground rules
The footage and data belong to the rights holders. Bring your own disc. Commit only our code.
