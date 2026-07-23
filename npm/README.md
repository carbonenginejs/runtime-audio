# @carbonenginejs/runtime-audio

Complete CarbonEngineJS audio domain with a graph-only `./trinity` entry and
optional Web Audio realization.

Use this package to hydrate and operate Carbon audio objects, connect them to
an application-supplied audio context and media loader, or schedule authored
interactive music. Audio acquisition and conversion remain with the host,
`@carbonenginejs/runtime-resource`, and Node tooling.

## Install

```sh
npm install @carbonenginejs/runtime-audio
```

## Quick start

The `./trinity` entry is safe in browsers and headless hosts. It creates no
audio context and performs no device work:

```js
import {
    AudEmitter
} from "@carbonenginejs/runtime-audio/trinity";

const emitter = new AudEmitter();
emitter.Initialize("engine", "ship_", [ 0, 0, 0 ]);
emitter.SetRTPC("speed", 0.5);

const values = emitter.GetValues();
```

Applications that need audible playback compose `CjsAudioSystem` with their
own context and decoded-buffer loader during a user gesture.

## Documentation

- [Package documentation](docs/README.md)
- [Architecture and boundaries](docs/architecture.md)
- [Browser playback guide](docs/guides/browser-playback.md)
- [Current API reference](docs/reference/api.md)
- [Carbon compatibility](docs/reference/carbon-compatibility.md)
- [Class-purpose catalog](docs/reference/classes/README.md)
- [Audio manager direction](docs/concepts/audio-manager.md)

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
