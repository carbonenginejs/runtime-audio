# Runtime audio documentation

Status: Evolving  
Scope: `@carbonenginejs/runtime-audio`  
Audience: Runtime authors, browser application authors, and integrators  
Summary: Explains the Carbon audio graph, optional Web Audio realization, and package boundaries.

## Purpose

`@carbonenginejs/runtime-audio` owns the complete CarbonEngineJS audio domain:
serializable Carbon audio objects, their portable behavior, event and music
scheduling, and an optional Web Audio realization.

The package is headless by default. Importing it does not create an
`AudioContext`, contact a service, load game data, or touch the document.

## Use this package when

Use `runtime-audio` when an application needs to:

- hydrate or inspect Carbon audio graph objects;
- run emitter, listener, culling, bank, RTPC, switch, or event behavior;
- realize that behavior through an injected Web Audio context and media
  loader;
- schedule a tools-generated interactive-music graph; or
- provide a compatible application-owned music engine.

Use the `./trinity` subpath when only graph data and portable behavior are
needed.

## Where it fits

```text
core-math + core-types + runtime-const
                  |
                  v
       runtime-audio/trinity
                  |
                  v
          runtime-audio
            ^          ^
            |          |
      applications   runtime-core composition
```

The host supplies source acquisition, encoded-media conversion, decoded
buffers, and the browser audio context. `@carbonenginejs/runtime-resource`
owns reusable audio format operations. Node acquisition, library generation,
caches, and HTTP services belong in `@carbonenginejs/tools-core`.

## Start here

For a headless graph:

```js
import {
    AudEmitter
} from "@carbonenginejs/runtime-audio/trinity";

const emitter = AudEmitter.from({
    name: "engine",
    eventPrefix: "ship_",
    position: [ 0, 0, 0 ]
});
```

For browser playback, start with `CjsAudioSystem` and the
[browser playback guide](guides/browser-playback.md).

## Documentation map

- [Architecture and boundaries](architecture.md)
- [Browser playback guide](guides/browser-playback.md)
- [Custom and authored music](guides/music.md)
- [Audio manager direction](concepts/audio-manager.md)
- [Current API reference](reference/api.md)
- [Carbon compatibility](reference/carbon-compatibility.md)
- [Class-purpose catalog](reference/classes/README.md)
