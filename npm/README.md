# @carbonenginejs/runtime-audio

Headless audio graph and data contracts for CarbonEngineJS. This package owns
the Carbon audio domain (schema families `audio`, `trinityAudio`,
`trinityAudioApi` — see `../.agents/CLASS-OWNERSHIP.md`) and ships it as a
**data-only graph**: hydrating, inspecting, and serializing audio state never
requires an AudioContext, WebAudio, Wwise, or a graphics engine.

Feature/status map: [`AUDIO-MAP.md`](./AUDIO-MAP.md). Ownership brief and
provenance rules: [`src/trinity/README.md`](./src/trinity/README.md).

## Boundary

- `src/trinity/` — **real Carbon classes**, generated from the format-carbon
  Blue reflection schema (`scripts/generate_trinity.js`) or hand-owned
  (`trinityAudio/`). Faithful to Carbon: fields mirror Blue attributes; the
  lifecycle/bank/emitter behavior is ported (2026-07-18 behavior pass), and
  remaining Carbon methods are `@carbon.method` + `@impl.notImplemented` stubs.
  This layer is importable on its own via the supported graph-only entry
  `@carbonenginejs/runtime-audio/trinity` — no backend module is evaluated and
  no AudioContext is touched.
- Outside `src/trinity/` — the `CjsAudio*` WebAudio realization implementing
  the `ICjsAudioSystem` contract: `CjsAudioSystem` (composition root wiring
  the three `AudGameObjResource` seams) + `CjsAudioBackend` (WebAudio node
  graph: per-source gain → emitter gain → HRTF panner → master). It consumes
  the data graph and an injected `loadBuffer` delegate (the app supplies
  runtime-resource's wem→ogg→PCM chain). Headless — no context supplied —
  `Enable` fails like Carbon's Init failure and the manager stays a true null
  manager: banks are never tracked, posts return 0 and queue emitter-side for
  replay on a later successful Enable's wake pass.

## Carbon field-name mapping (for SOF/consumers)

The schema keeps Carbon's real names. The commonly wanted emitter values map:

| Wanted | Schema field | Notes |
|---|---|---|
| name | `name` | `AudGameObjResource`, persisted |
| prefix | `eventPrefix` | `AudGameObjResource`, persisted |
| attenuation scaling | `scalingFactor` | `AudGameObjResource`, persisted; set via Carbon `SetAttenuationScalingFactor` |
| position | `position` | `[AUTHORED]` promotion (2026-07-18 port review): not a Blue attribute — Carbon routes it through `Initialize(name, prefix, position)` — but it is authored data, so the JS graph serializes it per the kb.md authored-value rule |

## Development

Decorated pure JavaScript under `src/` is canonical; Babel (`2023-11`
decorators) + Rollup transform it into `npm/dist`.

```powershell
npm run generate         # regenerate src/trinity/{audio,trinityAudioApi} from schema
npm run build:npm        # refresh npm/ metadata + rollup build
npm test                 # build + node --test
npm run lint             # build + node --check syntax gates
npm run proof:decorators # decorator transform behavior proof
npm run check            # lint + test + decorator proof
```

Package entry points (`exports`, mirrored in `npm.package.json` as `dist/`):

| Subpath | Target | Surface |
|---|---|---|
| `.` | `src/index.js` | full: graph + `CjsAudioSystem`/`CjsAudioBackend` + metadata factory |
| `./trinity` | `src/trinity/index.js` | graph-only (safe for runtime-sof / headless consumers) |
| `./audioMetadata` | `src/audioMetadata.js` | `audioMetadataFromSoundbanksInfo` |

## Current scope

- 13 generated Carbon data classes (12 `audio`, 1 `trinityAudioApi`) plus the
  hand-owned `trinityAudio` stretch classes — post-review set: pure interfaces
  carry no schema body, and 17 native-plumbing/telemetry classes were trimmed
  by the 2026-07-18 C++-verified port review (see `src/trinity/README.md`).
- Initial realization (2026-07-18, repaired 2026-07-19): `CjsAudioSystem` +
  `CjsAudioBackend` — WebAudio playback with per-source gain isolation,
  catalog-route virtual banks, HRTF positioning, stop/break fade semantics,
  and the true-null headless contract. RTPC/switch values are stored but not
  yet audibly mapped.
- Not yet: audible RTPC/state routing, real bank media management (banks are
  virtual on the catalog route), SOF integration (deferred per the kb.md
  "Open audio graph representation discussion" — SOF keeps its deferred
  metadata for now).

## Provenance

CarbonEngine and Fenris Creations (CCP Games) are named for interoperability
and provenance context. This package's runtime code is CarbonEngineJS original
work that ports or adapts CarbonEngine class structure and behavior, verified
against the CarbonEngine C++ source, and mines the ccpwgl WebGL port as a
reference donor. Not affiliated with or endorsed by CCP Games.
