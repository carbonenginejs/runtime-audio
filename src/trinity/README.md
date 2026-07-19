# src/trinity — real Carbon classes (owned here)

This folder holds the **real CarbonEngine classes** for the audio domain,
**owned by runtime-audio** as of 2026-07-18. Everything under `src/trinity/`
corresponds 1:1 to a class in the Carbon C++ source (`E:\carbonengine`, schema
docs in `format-carbon/src/schema/{audio,trinityAudio,trinityAudioApi}`).
Everything **outside** this folder (the `CjsAudio*` WebAudio system —
`CjsAudioSystem`/`CjsAudioBackend`, initial realization landed 2026-07-18; see
`../../AUDIO-MAP.md` and `../../carbonenginejs.md`) is CarbonEngineJS-
original: deliberately invented, `Cjs` prefix required, no Carbon counterpart.
This folder alone is the supported graph-only entry
`@carbonenginejs/runtime-audio/trinity`.

Real Carbon shapes and invented shapes never mix in one directory.

This folder is also runtime-audio's **data-only graph layer** (requester
direction, 2026-07-18): headless, serializable, no WebAudio/DOM dependencies —
it must hydrate and round-trip JSON without an AudioContext, per the
device-free graph rule in `.agents/CLASS-OWNERSHIP.md`. Other packages
(runtime-sof in particular) may depend on this layer alone to embed real audio
data models in their output graphs; realization stays optional.

## Claimed schema families

runtime-audio fully owns these three families; no other package may emit or
hand-maintain classes from them:

| Family | Carbon source | Classes |
|---|---|---|
| `audio/` | `audio/src` (carbon-audio, Aud*) | AudEmitter, AudListener, AudManager, AudGameObjResource, AudStaticDataRepository, AudParameter, AudPosition, AudEventCurve, AudEventKey, AudioCurveSetDriver, AudUIPlayer, AudMusicPlayer, AudSettings, AudPathResolver, AudioInputMgr, StretchAudio, IStretchAudio, ITr2DebugRenderable, AudActionLogCB, AudActionRecord (+ExecuteActionOnPlayingID/PostEvent/SetRTPC/SetState/SetSwitch variants) |
| `trinityAudio/` | `trinity/trinity/Audio` | Tr2AudioStretchBase, Tr2AudioStretchAuto (+ interface docs ITr2AudEmitter, ITr2Audio) |
| `trinityAudioApi/` | `trinityaudioapi/include` | ITr2AudEmitter, ITr2Audio, IStretchAudio, ITr2AudGeometry, Tr2AudGeometryData, IAudioInputMgr, IAudioInputSink |

## Inventory (materialized 2026-07-18 via `scripts/generate_trinity.js`; port review applied)

| Family | Classes |
|---|---|
| `audio/` (12) | AudGameObjResource, AudEmitter, AudListener, AudManager, AudParameter, AudEventKey, AudioCurveSetDriver, AudUIPlayer, StretchAudio, AudSettings (generated) + **AudStaticDataRepository, AudEventCurve (hand-owned behavior ports, 2026-07-18)** |
| `trinityAudio/` | Tr2AudioStretchBase, Tr2AudioStretchAuto (moved 2026-07-18 from runtime-trinity generated output; hand-owned) |
| `trinityAudioApi/` (1) | Tr2AudGeometryData |

Hand-owned mechanics: classes in `HAND_OWNED_CLASSES`
(`scripts/generate_trinity.js`) are never re-emitted or deleted by
`npm run generate`; the family index still includes them. Implemented behavior
so far: `AudStaticDataRepository` (full catalog: Initialize from the plain
audio metadata shape + all Carbon queries, squared-radius/AK_INVALID defaults
preserved) and `AudEventCurve` key management (add/insert/remove/get/set/sort,
Initialize/Reset; `UpdateValue` and emitter creation stay `@impl.notImplemented`
until realization).

Pure interfaces (ITr2AudEmitter, IStretchAudio, ITr2Audio, ITr2AudGeometry,
IAudioInputSink, AudMusicPlayer, ...) carry no schema body and are
intentionally not emitted (generator fallback). Rerun `npm run generate` to
refresh from schema; generated files may be hand-refined afterward (they then
become hand-owned — the generator overwrites, so promote deliberately).

## Port review (2026-07-18, C++-verified — outcomes encoded in scripts/generate_trinity.js)

- **Fidelity:** 11/14 priority classes were clean field-for-field ports of the
  Blue exposure. `TRIEXT_NONE == 0` confirmed (blue/include/ITriConstants.h:34).
- **Trimmed (17 classes):** native Wwise/OS plumbing, editor tooling, and
  runtime/debug telemetry with no data-graph value — FileHelpers, StringUtils,
  LowLevelIOHook, WaapiManager, AudPathResolver, AudioInputMgr, IAudioInputMgr,
  AudPosition, SoundPrioritization, SoundBankInfo, MonitoredParameterInfo,
  AudActionLogCB, AudActionRecord×5. (SoundPrioritization's *logic* is still a
  wanted behavior port — as an implementation, not a data class.)
- **Artifact strip:** AudStaticDataRepository had zero Blue attributes; its 12
  scanned fields were nested-struct artifacts — stripped, `Initialize` kept.
  Its real data arrives as a plain audio metadata object at runtime.
- **Scanner gap fixed:** AudManager `GetState` (AudManager_Blue.cpp:116) added.
- **Divergence marking:** members that diverge from Carbon get
  `@impl.adapted` (Carbon concept, deliberate adjustment) or `@impl.custom`
  (no Carbon equivalent) plus `@impl.reason("...")` — machine-readable schema
  metadata on methods AND fields (`impl` decorators became field-capable in
  core-types on 2026-07-18, requester decision, superseding the earlier
  method-only limitation). Promoted fields here carry `@impl.adapted` +
  `@impl.reason(...)` plus the `[AUTHORED]` JSDoc tag; `carbon.*` stays
  factual provenance and never explains divergence. This enables a future
  Blue-faithful export view (e.g. `GetValues({ carbonOnly: true })`) and
  drift audits to filter deliberate promotions.
- **Authored-value promotions (marked `[AUTHORED]` in JSDoc):**
  `AudGameObjResource.position` (Blue routes it through
  `Initialize(name, prefix, position)`) and `AudManager.settings`
  (`UpdateSettings` config). Serialized by the JS graph per the kb.md
  authored-value rule.
- **Deferred promotions (need new config model classes — decide at next pass):**
  AudManager's culling weights (`CullingSettings`) and `SpatialAudioSettings`
  are authored config exposed as Blue MAP_PROPERTY; promoting them means
  authoring `CullingSettings`/`SpatialAudioSettings` config shapes first.
- **Enums (org rule applied 2026-07-18):** Carbon enums live as frozen
  object-valued statics on their class so `@schema.enum` resolves and users
  address `AudEventCurve.TRIEXTRAPOLATION.TRIEXT_CYCLE`. `TRIEXTRAPOLATION`
  is shared vocabulary, now owned by **runtime-const**
  (`graphics/trinityEnums.js` `TriExtrapolation`, values from
  `blue/include/ITriConstants.h:33`); `AudEventCurve.TRIEXTRAPOLATION`
  aliases it (TriOperator pattern). Trinity-side follow-up for the trinity
  agent: add `TRIEXTRAPOLATION -> { import: "TriExtrapolation", from:
  runtime-const/graphics }` to trinity's `ENUM_IMPORT_MAP` so `TriEventCurve`
  gets the same alias on regeneration.
- **Accepted divergences:** MAP_PROPERTY computed properties are not fields;
  `AudGameObjResource.parameters` emits `@io.persist` where Blue says
  READ|PERSIST; `AudUIPlayer.eventSenderCallback` is Python-only in Blue but
  kept.

## What runtime-audio does NOT own (stays in runtime-trinity / elsewhere)

- Scene-graph classes that merely hold an emitter reference: `EveChildAudio`,
  `AudioGameObject`, `EveStretch3`, `EveTurretSet`, `Tr2ExternalParameter`,
  and the controller actions (`Tr2ActionPlaySound`, `Tr2ActionBindRTPC`,
  `Tr2ActionSetAudioSwitch`, `Tr2ActionSetAudioEmitterPrefix`). Ownership
  follows the audio system, not the reference — these are trinity scene/
  controller classes that consume `ITr2AudEmitter`.
- `ITr2SoundEmitterOwner` (trinity scene interface, implemented by space
  objects) — runtime-trinity.
- `mesh/AudioOcclusionMesh*` (mesh tooling), `resources/AudioGeometryResData`
  (resource class), `videoPlayer/AudioMetadata` (video domain),
  `spatialAudioClustering/*` (Wwise authoring plugin — not required, unclaimed).

## Ownership mechanics

- `runtime-trinity/scripts/regenerate_generated.js` declares
  `AUDIO_OWNED_FAMILIES = {audio, trinityAudio, trinityAudioApi}` and skips
  those docs with reason **"owned by runtime-audio"** — they will never be
  (re-)emitted into runtime-trinity.
- The `trinityAudio` files here started as verbatim copies of the trinity
  generator's output (schema-derived field shells). They are now hand-owned:
  maintain against the Carbon source / schema docs.

## Provenance rules

Inside `src/trinity/`:
- **Carbon C++ (`E:\carbonengine`) is truth.** Fields, families, and method
  signatures follow Carbon; mark Carbon methods `@carbon.method` with an
  `@impl.*` status. JS-only helpers should be free functions or `#private`;
  unavoidable public methods with no Carbon counterpart get `@impl.custom`.
- Wwise middleware internals (Ak* calls, LowLevelIO, WAAPI, spatial-audio
  geometry) are NOT ported — the WebAudio realization lives outside this
  folder in `CjsAudioSystem`/`CjsAudioBackend`. Classes here keep Carbon's
  data shape and API surface; device work routes through the three
  null-default `AudGameObjResource` statics (`manager`, `staticDataRepository`,
  `backend`), and with all seams null the graph reproduces Carbon's
  null-`g_audioManager` semantics by construction.

Outside `src/trinity/` (the `CjsAudio*` graph): CarbonEngineJS-original, no
Carbon fidelity obligations, `Cjs` prefix required.
