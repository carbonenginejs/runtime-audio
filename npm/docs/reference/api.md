# Runtime audio API reference

Status: Experimental  
Scope: `@carbonenginejs/runtime-audio`  
Audience: Runtime authors and application integrators  
Summary: Lists the current public subpaths and principal runtime-audio exports.

## Contract

All public entries are ECMAScript modules and are safe to import without
creating an audio context. The `./trinity` entry excludes realization modules.

## Subpaths

| Import | Purpose |
| --- | --- |
| `@carbonenginejs/runtime-audio` | Complete graph, metadata adapter, audio system, backend, and music scheduler. |
| `@carbonenginejs/runtime-audio/trinity` | Carbon audio graph classes and portable behavior without backend evaluation. |
| `@carbonenginejs/runtime-audio/audioMetadata` | `audioMetadataFromSoundbanksInfo()` without importing the complete package. |

## Realization exports

| Export | Purpose |
| --- | --- |
| `CjsAudioSystem` | Composes metadata, Carbon manager behavior, backend playback, graph adoption, and optional music. |
| `CjsAudioBackend` | Implements the Web Audio emitter, source, listener, gain, RTPC, switch, seek, and completion operations. |
| `CjsMusicEngine` | Schedules an authored interactive-music graph against decoded media. |
| `wwiseIdFromName(name)` | Computes the lowercase 32-bit Wwise name hash used by authored event and state names. |
| `audioMetadataFromSoundbanksInfo(document, enrichment)` | Converts caller-supplied SoundbanksInfo data into repository metadata and optionally merges culling enrichment. |

The [class-purpose catalog](classes/README.md) lists every public and internal
class with its exact source and provenance kind.

## `CjsAudioSystem` lifecycle

1. Construct with metadata and loader capabilities.
2. Call `Attach()` to install the graph seams.
3. Call `Enable()` from a browser user gesture.
4. Adopt or create emitters.
5. Call `Process(now)` from the application update loop.
6. Release individual emitters or call `Dispose()`.

Only one attached system owns the static graph seams at a time.

## Metadata shape

`audioMetadataFromSoundbanksInfo()` returns:

```js
{
    Events: {},
    SoundBanks: {},
    WemFileIDs: {}
}
```

Missing optional enrichment degrades culling information rather than changing
event identity. Invalid input without a `SoundBanksInfo.SoundBanks` document
throws `TypeError`.

## Constraints

- Web Audio playback requires a host-created compatible context.
- Effect and built-in music loaders return complete decoded buffers.
- Graph-only imports do not imply audible playback.
- The current system consumes split inputs rather than installing a complete
  schema-v2 audio library.
- Custom music-engine factories are synchronous because they run during
  gesture-time enablement.

## Errors

| Failure | Meaning |
| --- | --- |
| `Enable()` returns `false` | No usable backend context was created. |
| Posting returns playing ID `0` | The event was queued, culled, unknown, blocked on banks, or unavailable to the backend. |
| `ValidateMusicEngine()` throws `TypeError` | The supplied engine is asynchronous or lacks a required method. |
| `AdoptEmitter()` throws | The value is not an audio game object or reuses another object's ID. |

## Related documentation

- [Architecture and boundaries](../architecture.md)
- [Browser playback guide](../guides/browser-playback.md)
- [Carbon compatibility](carbon-compatibility.md)
