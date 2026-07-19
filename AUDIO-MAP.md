# Audio Port Map — carbonengine audio → runtime-audio

Last updated: 2026-07-19 (remediation pass: per-source gain isolation, true-null headless
contract, graph-only `./trinity` entry). Companion to the org-wide `../ENGINE-MAP.md` and to this package's
design doc `./carbonenginejs.md` (2026-07-15 — WebAudio plan, verified Wwise data facts,
wem→ogg route). This file is the feature-by-feature status map; the design doc is the how.

C++ sources: `E:\carbonengine\audio` (Aud*, Wwise wrapper), `E:\carbonengine\trinityaudioapi`
(the interface contract Trinity consumes), plus Trinity's audio consumers (SOF, controllers,
turrets, stretch).

Status legend: **Done** / **In progress** / **Not started** / **Not required** / **TBD**.

**Class ownership (claimed 2026-07-18):** runtime-audio fully owns the schema families
`audio`, `trinityAudio`, and `trinityAudioApi` — declared in
`runtime-trinity/scripts/regenerate_generated.js` (`AUDIO_OWNED_FAMILIES`, skip reason
"owned by runtime-audio") so no other package emits them. `Tr2AudioStretchBase/Auto` were
moved out of runtime-trinity's generated tree into `src/trinity/trinityAudio/` here. Full
ownership brief, inventory, and the stays-in-trinity list: `src/trinity/README.md`.

---

## 1. Data and decode layer — DONE (runtime-resource plus caller-provided metadata)

| C++ piece | JS equivalent | Status | Notes |
|---|---|---|---|
| SoundBank container (.bnk) read | `runtime-resource/formats/bnk` (`CjsBnkFormat`) | **Done** | BKHD/DIDX/DATA/HIRC/STID walked; embedded wem extraction; HIRC entries carry typed fields (event actions, action type/target, sound/track source ids) + raw payload views; `CjsBnkFormat.wwise.eventMediaFromBanks` resolves event→media over merged banks — see §5 |
| Streamed media (.wem, Wwise Vorbis) | `runtime-resource/formats/wem` (`CjsWemFormat.toOgg`) | **Done** | Lossless Wwise-Vorbis→Ogg repack (aoTuV codebooks), validated bit-exact vs vgmstream. EVE splits codecs: music/voice = Vorbis, most embedded SFX (turrets/artillery) = PTADPCM (0x8311) — decoded to float32 by `CjsWemFormat.toPcm` (also covers 16-bit PCM); Opus/XMA remain undecoded |
| PCM decode for non-Ogg-native browsers | `runtime-resource/formats/ogg` (`CjsOggFormat`) | **Done** | Pure-JS Vorbis→PCM (AudioBuffer-ready), the Safari path |
| `AudStaticDataRepository` source data (event → id/radius/loop/2D/vital/stoppedBy/banks) | **Primary:** SoundbanksInfo.json via `audioMetadataFromSoundbanksInfo()` (`src/audioMetadata.js`, dependency-free — supplies the live-posting must-haves: event→id, event→banks, wem membership). **Optional enrichment:** a caller-provided plain-JSON artifact adds radius/loop/2D/vital/stops/essential metadata for better culling. | **Done** | Missing enrichment degrades gracefully: sound plays, culling is less informed. |
| `AudPathResolver` / `AudSettings` (res:/Audio, `%u.bnk`/`%u.wem`, Essential_Media, Media, language folders) | **`tools-core/src/audio` audio-library generator** (`npm run build:audio`): joins resfileindex (media/bank res paths, essential/language routing) + SoundbanksInfo + optional offline metadata enrichment into one `carbonenginejs.audioLibrary` JSON (cache-only artifact, `custom/{provider}_{build}_audio_v1.json`). `library.metadata` feeds `AudStaticDataRepository.Initialize` directly; `library.media[wemId].resPath` feeds the `loadBuffer` delegate | **Done** (2026-07-18) | Mirrors the tools-core character-library pattern; deterministic, offline-tested (tools-core 42/42) |

## 2. The contract — ITr2AudEmitter and friends

This is the porting boundary. Trinity-side **consumers already exist and are implemented** in
runtime-trinity; the **provider now exists here**: the emitter surface is served by the
`src/trinity/audio/` behavior port (§3) and made audible by the `ICjsAudioSystem`
realization (last row). Statuses below are per-interface.

| C++ interface | JS status | Notes |
|---|---|---|
| `ITr2AudEmitter` — `Initialize(name,prefix,pos)`, `SendEvent(name,bypassPrefix)→playingID`, `SetPosition(front,top,pos)`, `SetName/SetPrefix`, `SetSwitch(group,state)`, `SetRTPC(name,value)`, `SetAttenuationScalingFactor`, `SetVisibility`, `Mute/Unmute`, `ForceCullingStateChange/Release` | **Done** (data + behavior, 2026-07-18) — provided by `AudEmitter`/`AudGameObjResource` (§3) | The full contract surface is implemented on the graph classes; device work routes through the three null-default seams, audible via `ICjsAudioSystem`. Consumers in runtime-trinity call `SendEvent`/`SetRTPC`/`SetSwitch` on it |
| `ITr2SoundEmitterOwner` — `FindSoundEmitter(name)` recursive lookup over placement observers | **In progress** | runtime-trinity's `findSoundEmitter(owner, name)` helper exists (used by Tr2ActionBindRTPC); full observer-graph semantics land with the scene runtime |
| `IStretchAudio` — `Start/Stop/Update(src,dst)/FindEmitterByName` | **Not started** | Data classes `Tr2AudioStretchBase/Auto` generated (stubs) |
| `ITr2AudGeometry` (Wwise Spatial Audio occlusion/diffraction geometry) | **Not required** | No browser equivalent; stub |
| `IAudioInputMgr` (video PCM → Wwise input plugin, `volume_video` RTPC) | **Not required** | Browser media element / WebAudio source node replaces it |
| `ICjsAudioSystem` (JS-only: the runtime-core service slot) | **Done** (initial 2026-07-18, repaired 2026-07-19) | `CjsAudioSystem` + `CjsAudioBackend` (`src/`, outside trinity): WebAudio realization filling the three seams — injectable context + `loadBuffer` delegate (app wires runtime-resource wem→ogg→decode), catalog-route virtual banks, HRTF panner chain, end-of-event → `EventFinishedCallback`. 2026-07-19 contracts: **per-source gain isolation** (each playing source owns its gain; stop/replay cannot bleed across concurrent events), explicit 0 ms fade = immediate stop, pending-load break/stop/unregister teardown, and the **true-null headless contract** (no backend → `Enable` fails like Carbon Init failure, banks never tracked, posts queue emitter-side for a later wake). Graph-only consumers import `@carbonenginejs/runtime-audio/trinity`. Fake-context tested end-to-end. Future: RTPC/switch audible mappings, real browser smoke |

## 3. Engine/scene layer — the actual runtime-audio work

Update 2026-07-18: the **data classes** for every row below now exist —
generated from schema into `src/trinity/audio/` (12 classes post-review,
fields faithful to Blue exposure plus two `[AUTHORED]` promotions, Carbon
methods as `@carbon.method @impl.notImplemented` stubs), packaged
(`@carbonenginejs/runtime-audio` 0.1.0, decorated pure JS, npm build + tests +
decorator proof green). A C++-verified port review trimmed 17 native-plumbing/
telemetry classes and fixed 3 scanner-artifact defects — outcomes in
`src/trinity/README.md` "Port review". "Not started" below now means the
**behavior**, not the data shape. SOF integration stays deferred per kb.md.

| C++ class | Purpose | JS equivalent | Status |
|---|---|---|---|
| `AudManager` | Singleton lifecycle, bank load/unload + `SoundBankStatus`, deferred-event queue (`RegisterEventAfterSoundBankLoad`), global RTPC/state, game-object registry, tick | `src/trinity/audio/AudManager.js` | **Done** (logic, 2026-07-18; true-null Enable 2026-07-19) — state machine, async bank tracking + LOADED flush (bypassPrefix=true), watcher refcounts, Process order; Wwise init/render via backend seam. `Enable` without a backend stays un-enabled (Carbon Init-failure semantics, AudManager.cpp:848-881), so headless bank loads are never tracked. Scenario-tested end-to-end with live emitters |
| `AudGameObjResource` | Per-emitter state: playing events map, RTPC/switch values, prefix logic (`PrepareEvent` prepends `m_eventPrefix`), events-on-wake, culling participation | `src/trinity/audio/AudGameObjResource.js` | **Done** (bookkeeping, 2026-07-18) — full state machine; Wwise calls route through null-default `manager`/`backend`/`staticDataRepository` statics (headless = Carbon null-manager semantics) |
| `AudEmitter` | Concrete content-facing emitter (implements ITr2AudEmitter), attenuation-normalization fields | `src/trinity/audio/AudEmitter.js` | **Done** (2026-07-18) — SendEvent/SetPosition/UpdatePlacement + unclamped attenuation-normalization remap |
| `AudListener` | Singleton listener; all distance math relative to it | `src/trinity/audio/AudListener.js` | **Done** (data/state, 2026-07-18) — fixed id 4 via base ctor, FLT_MAX additional weight; backend listener registration is realization |
| `AudStaticDataRepository` | In-memory event-metadata catalog driving culling weight, attenuation radius, bank prerequisites | `src/trinity/audio/AudStaticDataRepository.js` | **Done** (2026-07-18) — full behavior port, fed by the plain audio metadata shape; tested |
| `SoundPrioritization` | Audio culling: ≤N awake emitters, weighted scoring (vital/2D/range/visible/used/one-shot weights) | `src/trinity/audio/SoundPrioritization.js` | **Done** (2026-07-18) — full logic port incl. the strict-`>` +1 quirk, getter×multiplier asymmetry, one-shot window; scenario-tested |
| `AudParameter` | Bindable per-object RTPC value pushed on `OnModified` (e.g. ship speed → RTPC) | — | **Not started** (consumer side exists: `EveShip2` booster-intensity plumbing is in the generated classes) |
| `AudEventCurve` / `AudEventKey` | Timeline curve whose keys fire audio events as playback time crosses them | `src/trinity/audio/AudEventCurve.js` | **In progress** — key management + Initialize/Reset done (2026-07-18); `UpdateValue` event dispatch lands with realization |
| `AudioCurveSetDriver` | Reverse direction: live RTPC value drives a curve-set's time (with fallback curve) | `src/trinity/audio/AudioCurveSetDriver.js` | **Done** (2026-07-18) — fallback-until-RTPC-exists semantics; monitored-parameter registration via the manager seam |
| `StretchAudio` (Components/) | Three-emitter beam audio (source/dest/stretch, listener projected onto segment) | `src/trinity/audio/StretchAudio.js` | **Done** (2026-07-18) — clamped segment projection, degenerate/no-listener guards, Start/Stop event contract; tested |
| `AudUIPlayer` / `AudMusicPlayer` | 2D/UI + dialogue player (event-finish callbacks, play position), music emitter | `AudUIPlayer.js` (stub) / `src/trinity/audio/AudMusicPlayer.js` | AudUIPlayer **Not started**; AudMusicPlayer **Done** (2026-07-19) — trivial AudEmitter subclass (fixed id 3, "Music", FLT_MAX weight, origin pose; AudMusicPlayer.cpp:6-11). Dynamic-music behavior lives in `CjsMusicEngine` (see below) |
| `AudActionLog` | Debug/telemetry ring of audio actions | — | **TBD** — optional, but valuable for parity testing against the real client |
| *(no Carbon equivalent)* Wwise interactive-music engine | Segments/playlists/switch containers, transitions, steering — Carbon never initializes AK::MusicEngine (InitMusic is dead code); all musical intelligence is authored in the banks | `src/CjsMusicEngine.js` + `scripts/build_music_graph.js` + `scripts/lib/musicHirc.js` | **Done** (initial, 2026-07-19) — offline graph extraction (v150 payloads corpus-validated 100%: 2,484 tracks / 1,326 segments / 214 playlists / 54 switch containers; 93 play, 80 stop, 133 setter events) + runtime engine: decision-tree switch resolution, playlist iteration (sequence/random/weights/loops), sample-accurate exit-cue segment chaining, rule-based transitions with fades, authored stop events. Backed into `CjsAudioBackend` via the musicEngine seam; graph artifact is cache-only (.tmp). v1 gaps: stingers, transition segments, MIDI/Synth One tracks (silent), RTPC volume faders. See `.agents/handoff/2026-07-19-dynamic-music-research.md` |

## 4. Trinity/content consumers (live in runtime-trinity / runtime-sof — status there)

| C++ consumer | JS status | Notes |
|---|---|---|
| `Tr2ActionPlaySound`, `Tr2ActionBindRTPC`, `Tr2ActionSetAudioSwitch`, `Tr2ActionSetAudioEmitterPrefix` | **Done** (`@impl.adapted`, real logic in runtime-trinity/controllers) | Tr2ActionBindRTPC compiles its expression via CjsControllerExpressionProgram and calls `emitter.SetRTPC` per update — blocked only on an emitter existing |
| `Tr2ActionSetAttenuationScaling` | **TBD** — verify it exists in runtime-trinity controllers | |
| `EveSOFDataHullSoundEmitter` (name/prefix/position/rotation/attenuationScalingFactor) + `EveSOFDataHull.soundEmitters` + hull `audioPosition` | **Done** (data classes, runtime-sof) | |
| `EveSOF::SetupAudio` — build step: per hull sound emitter create observer + `AudEmitter`, `Initialize(name,prefix,worldPos)`, `SetAttenuationScalingFactor` | **In progress** (deferred half done) | runtime-sof already emits `TriObserverLocal` + deferred `sofAudioEmitterSetup` metadata (confirmed 2026-07-18, no emitter instantiated). Decision (requester, 2026-07-18): the metadata **keeps** `className: "AudEmitter"` and its full declarative fields — the serialized JSON is a headless API and external consumers may rebuild audio from it themselves. runtime-sof never constructs from it; our realization requests an opaque `ITr2AudEmitter` from `ICjsAudioSystem` and hands it the metadata. See `.agents/CLASS-OWNERSHIP.md` device-free graph rule + handoff replies in `.agents/handoff/2026-07-18-runtime-audio-class-claim.md` |
| `AudioGameObject`, `EveChildAudio` (free-floating / child-attached emitters) | **Done** (generated data classes, methods `notImplemented`) | Behavior lands when the emitter API exists |
| `EveTurretSet` movement audio events, `EveShip2` speed→RTPC, `EveStretch3` → stretch audio | **Done** (data classes) / behavior **Not started** | |

## 5. Event semantics — DECIDED 2026-07-18: catalog route + HIRC edge extraction

CarbonEngine never interprets banks itself — Wwise does. Posting event id N causes Wwise to
walk HIRC (event → actions → sounds/containers → media, with per-node volume, loop, RTPC
curves, attenuation, switch/state routing). Resolution:

- **Runtime stays on the catalog route** (option b of the original decision): the engine
  posts events by name/id; the backend resolves media and plays with metadata-driven
  loop/2D/radius flags. No per-node gain curves or container weighting at runtime.
- **Exact event → wem edges are extracted OFFLINE** by the bnk format in
  runtime-resource (`@carbonenginejs/runtime-resource/formats/bnk`):
  `CjsBnkFormat.inspect()` decodes typed HIRC fields, and
  `CjsBnkFormat.wwise.eventMediaFromBanks` walks the merged graph (the
  `wwise` static groups the domain toolkit: SoundbanksInfo helpers, id hash,
  graph walk). Moved there 2026-07-18 (originally `runtime-audio/hirc`, briefly
  a `formats/wwise` folder) so end users of the format get the graph without
  the engine; runtime-audio itself consumes only the library artifact. Shipped in the audio library as the additive
  `eventMedia` table, plus `embeddedMedia` (wemId → bank/offset/length) for
  the SFX wems that live inside bank DATA rather than the streamed index.
  tools-core `build_audio_library.js --event-media` generates both.

Ground truth pinned against real EVE banks (build 3435006, bank version 150 / Wwise
2022.1), hexdump-verified; layouts documented in the bnk helpers and
`.agents/AUDIO-PORT-KB.md`. Key facts: EVE splits banks — `common.bnk` holds ALL
Events/Actions (no media), media banks hold sounds/containers, so edges only resolve
over a graph merged across every bank; Play family = actionType high byte `0x04`;
SFX media is embedded (DIDX/DATA), music is streamed with embedded prefetch heads.
Walk results: byte-exact on all 22 banks; 5,092 of 10,766 events resolve to media
(median fan-out 1 wem); ~4,000 unresolved are stop/pause events (no play target by
design); ~1,250 play-like events reference target objects absent from every shipped
bank (unshippable by CCP's own data). Deep HIRC (per-node gains, random-container
weighting, switch routing) remains future work if audible fidelity demands it.

## 6. Not required (native/middleware — never porting)

Wwise engine init (`InitSound/InitLowLevel/...`), `AudGeometry` + `SpatialAudioSettings`
(raytraced spatial audio), `LowLevelIOHook`/WAAPI, device-change callbacks, profiler capture,
`spatial-audio-clustering` (authoring plugin). Spatialization itself maps to WebAudio
`PannerNode` (HRTF, inverse distance) per the ccpwgl 2026-07-05 handoff's chosen signal chain.

## 7. Package shape (requester direction, 2026-07-18) and build order

runtime-audio is two layers, mirroring the org's device-free graph rule:

- **Data-only audio graph** (`src/trinity/` — the Carbon `Aud*`/stretch classes):
  headless, serializable, no WebAudio or DOM dependencies, hydrates from JSON like
  any other Carbon family. This layer is an export surface in its own right —
  runtime-sof may consume it (e.g. hydrating real `AudEmitter` data models into
  its output graph instead of raw `sofAudioEmitterSetup` metadata) without
  pulling in realization. Depending on it must never require an AudioContext.
  Target SOF representation (kb.md "Open audio graph representation discussion"
  + runtime-audio position in the 2026-07-18 handoff): `TriObserverLocal.observer`
  holds a typed headless `AudEmitter` node so generic `GetValues()`/`from()`
  round-trips preserve the emitter; the raw `sofAudioEmitterSetup` record is
  transitional until this class ships — which makes the `AudEmitter` data class
  the **first concrete deliverable** of this package (build order step 0).
- **Realization** (`Cjs*` outside `src/trinity/`): the WebAudio `ICjsAudioSystem`
  implementation that consumes the data graph (or the equivalent JSON payload)
  and produces sound. Optional at every level — graphs build, serialize, and
  round-trip without it.

### Build order

1. **`CjsAudioSystem` core** (implements ICjsAudioSystem): AudioContext lifecycle (lazy,
   gesture-gated), listener, emitter registry, master gain — reference: ccpwgl `Tw2AudMan` +
   the 2026-07-05 handoff spec.
2. **Metadata catalog** (`AudStaticDataRepository` equivalent) fed from audiometadata +
   SoundbanksInfo — gives event → banks/radius/loop/2D/vital.
3. **Bank/media manager**: bank load state machine + deferred-event queue; media fetch via
   res:/Audio naming rules; wem→ogg→decode into cached AudioBuffers.
4. **`CjsAudEmitter`** (ITr2AudEmitter surface): SendEvent with prefix logic, per-object
   RTPC/switch state, PannerNode placement, attenuation scaling. This unblocks the four
   already-implemented runtime-trinity actions.
5. **SOF SetupAudio** + `FindSoundEmitter` owner graph → ships emit on load.
6. **Prioritization/culling** port (`SoundPrioritization` — pure logic) once emitter counts
   are real; then stretch audio, event curves, curve-set driver, UI/music players.
