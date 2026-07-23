# Play audio in a browser

Status: Experimental  
Scope: `@carbonenginejs/runtime-audio`  
Audience: Browser application authors  
Summary: Shows how to attach the current audio system to a browser-owned context and buffer loader.

## Purpose

Use `CjsAudioSystem` when Carbon emitters should produce sound through Web
Audio. The application remains responsible for creating the context during a
user gesture and returning decoded `AudioBuffer` values.

## Prerequisites

- A browser with Web Audio support.
- Event metadata with `Events`, `SoundBanks`, and `WemFileIDs` sections.
- A loader that resolves an event ID and name to a decoded `AudioBuffer`.

## Steps

The following example synthesizes a short caller-owned buffer so it needs no
external files:

```js
import {
    CjsAudioSystem
} from "@carbonenginejs/runtime-audio";

const metadata = {
    Events: {
        ui_click: {
            eventID: 1,
            maxRadiusAttenuation: 0,
            isLoop: 0,
            is2D: 1,
            isVital: 0,
            eventsStoppedBy: [],
            soundbanks: []
        }
    },
    SoundBanks: {},
    WemFileIDs: {}
};

let context;

function createClickBuffer()
{
    const buffer = context.createBuffer(1, 2400, context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < channel.length; index++)
    {
        channel[index] = Math.sin(index * 0.2) * (1 - index / channel.length);
    }

    return buffer;
}

const audio = new CjsAudioSystem({
    audioMetadata: metadata,
    createContext: () => context = new AudioContext(),
    loadBuffer: async () => createClickBuffer()
});

audio.Attach();

if (!audio.Enable())
{
    throw new Error("Audio context creation failed");
}

await context.resume();

const emitter = audio.CreateEmitter({
    name: "example",
    position: [ 0, 0, 0 ]
});

if (emitter.IsCulled())
{
    emitter.ForceCullingStateChange();
}

emitter.SendEvent("ui_click");
audio.Process(performance.now());

await new Promise(resolve => setTimeout(resolve, 100));

// Release emitters, buffers, nodes, and graph seams when the owner closes.
audio.Dispose();
```

In a real application, `loadBuffer(eventID, eventName)` normally resolves
source bytes through an application provider, converts them with
`@carbonenginejs/runtime-resource` format operations, and creates an
`AudioBuffer`.

## Errors

- `Enable()` returns `false` when no context is produced. The manager remains
  headless and does not claim loaded banks.
- Event posting returns playing ID `0` when metadata, media, bank readiness, or
  backend playback is unavailable.
- A rejected or null loader result produces no source. Failed music-media
  loads are evicted so a later call may retry.

## Cleanup

Call `ReleaseEmitter()` when one adopted emitter is no longer needed. Call
`Dispose()` when the complete audio owner shuts down. Disposing stops playback,
clears graph seams, releases backend nodes, and disposes the music engine.

## Related documentation

- [Architecture and boundaries](../architecture.md)
- [Current API reference](../reference/api.md)
- [Custom and authored music](music.md)
