# Audio manager direction

Status: Evolving  
Scope: `@carbonenginejs/runtime-audio`  
Audience: Runtime authors and application integrators  
Summary: Separates the current audio-system contract from the approved whole-library manager direction.

## Purpose

The package currently exposes `CjsAudioSystem`. The approved destination is a
narrower `CjsAudioMan` composition root that installs one complete audio
library and owns audio-specific source selection and preparation. This page
keeps that planned boundary distinct from imports available today.

## Current

`CjsAudioSystem` currently receives:

- `audioMetadata` for event, bank, culling, and media membership facts;
- `musicGraph` for authored interactive music;
- `loadBuffer(eventID, eventName)` for effect playback;
- `loadMedia(sourceID, track)` for built-in music;
- an optional context factory or compatible music engine; and
- an optional RTPC application delegate.

It composes `AudManager`, `AudStaticDataRepository`, `CjsAudioBackend`, and
`CjsMusicEngine`. It adopts and releases graph emitters, but it does not
install or fetch a complete generated audio library.

The current backend expects complete decoded `AudioBuffer` values. It does not
stream long sources.

## Planned

`CjsAudioMan` is planned to:

- install and validate one immutable semantic audio library;
- resolve events, banks, loose media, embedded members, and prepared variants;
- select an explicitly supported language and delivery variant;
- coordinate bank extraction and WEM or prepared-media conversion;
- deduplicate pending decode work;
- retain and release decoded backend buffers under explicit policy; and
- continue exposing Carbon manager, emitter, and listener behavior.

The manager remains able to run without a general resource manager. It accepts
an injected structural media provider. A runtime-core adapter may use ResMan
for raw or converted resource budgeting, but ResMan does not resolve audio
events, interpret banks, or own decoded-audio playback policy.

## Activation gates

The planned name becomes current only after:

1. the whole-library installer and media-provider contract are implemented;
2. current direct `loadBuffer` and `loadMedia` consumers have a migration path;
3. runtime-core composition and shutdown tests pass;
4. the browser demo proves effect, authored music, and caller-owned music
   paths; and
5. package exports and documentation change together.

Until those gates pass, consumers import and use `CjsAudioSystem`.

## Non-goals

- Moving audio-domain behavior into runtime-utils.
- Making a general resource manager understand event or bank semantics.
- Requiring a live Node service for runtime playback.
- Treating filenames or URLs as canonical Wwise media identity.
- Claiming that the current buffer loader provides streaming.

## Related documentation

- [Architecture and boundaries](../architecture.md)
- [Current API reference](../reference/api.md)
- [Custom and authored music](../guides/music.md)
