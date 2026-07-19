import test from "node:test";
import assert from "node:assert/strict";
import { CjsAudioBackend } from "../npm/dist/index.js";


// Per-source isolation contract (2026-07-19): every playing source owns its
// gain node, so stop-fades, replays, and pending-load teardown on one event
// can never change a concurrent event's gain or lifetime on the same emitter.

function FakeParam(initial)
{
  const param = {
    value: initial,
    ramps: [],
    linearRampToValueAtTime(value, time)
    {
      param.ramps.push([value, time]);
    }
  };
  return param;
}

function FakeContext()
{
  const context = {
    currentTime: 0,
    destination: { name: "destination" },
    gains: [],
    sources: [],
    createGain()
    {
      const node = {
        gain: FakeParam(1),
        connectedTo: null,
        disconnected: false,
        connect(target)
        {
          node.connectedTo = target;
        },
        disconnect()
        {
          node.disconnected = true;
        }
      };
      context.gains.push(node);
      return node;
    },
    createPanner()
    {
      return {
        panningModel: "", distanceModel: "", refDistance: 1,
        positionX: FakeParam(0), positionY: FakeParam(0), positionZ: FakeParam(0),
        connect: () => {}, disconnect: () => {}
      };
    },
    createBufferSource()
    {
      const source = {
        buffer: null, loop: false, onended: null, started: false, stoppedAt: null,
        connectedTo: null,
        connect(target)
        {
          source.connectedTo = target;
        },
        start()
        {
          source.started = true;
        },
        stop(time)
        {
          source.stoppedAt = time ?? context.currentTime;
        }
      };
      context.sources.push(source);
      return source;
    }
  };
  return context;
}

function Deferred()
{
  let resolve;
  const promise = new Promise(r =>
  {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

// Gain creation order: gains[0] master, gains[1] the sfx bus, gains[2] the
// emitter gain from RegisterGameObj; each PostEvent appends that source's
// own gain after those.
function Harness({ loadBuffer, isLoop } = {})
{
  const context = FakeContext();
  const finished = [];
  const emitter = { EventFinishedCallback: playingID => finished.push(playingID) };
  const backend = new CjsAudioBackend({
    context,
    loadBuffer: loadBuffer ?? (async () => ({ fake: "buffer" })),
    isLoop: isLoop ?? (eventName => String(eventName).includes("loop"))
  });
  backend.RegisterGameObj(1);
  return { context, finished, emitter, backend };
}


test("stopping one of two concurrent sources leaves the other's gain and lifetime untouched", async () =>
{
  const { context, finished, emitter, backend } = Harness();
  const idA = backend.PostEvent(7, 1, 0, emitter, "shot_a");
  const idB = backend.PostEvent(8, 1, 0, emitter, "shot_b");
  await tick();
  const [gainA, gainB] = [context.gains[3], context.gains[4]];
  const [sourceA, sourceB] = context.sources;
  assert.ok(sourceA.started && sourceB.started);
  assert.equal(gainA.connectedTo, context.gains[2], "source gains chain into the emitter gain");

  backend.ExecuteActionOnPlayingID("stop", idA, 500);

  assert.deepEqual(gainA.gain.ramps, [[0, 0.5]], "stopped source fades on its own gain");
  assert.equal(sourceA.stoppedAt, 0.5);
  assert.equal(gainB.gain.value, 1, "sibling gain value untouched");
  assert.deepEqual(gainB.gain.ramps, [], "sibling gain has no scheduled fade");
  assert.equal(sourceB.stoppedAt, null, "sibling source not stopped");
  assert.equal(backend.GetPlayingCount(), 2, "sibling record still alive before onended");

  sourceA.onended?.();
  assert.deepEqual(finished, [idA], "only the stopped source finished");
  assert.equal(backend.GetPlayingCount(), 1);
});


test("replaying on an emitter does not disturb a sibling's in-progress fade", async () =>
{
  const { context, emitter, backend } = Harness();
  const idA = backend.PostEvent(7, 1, 0, emitter, "engine_loop");
  await tick();
  const gainA = context.gains[3];
  backend.ExecuteActionOnPlayingID("stop", idA, 1000);
  assert.deepEqual(gainA.gain.ramps, [[0, 1]]);

  backend.PostEvent(7, 1, 0, emitter, "engine_loop");
  await tick();

  assert.equal(context.sources[1].started, true, "replay starts on its own fresh gain");
  assert.deepEqual(gainA.gain.ramps, [[0, 1]], "the fading source keeps its ramp");
  assert.equal(gainA.gain.value, 1, "no hard reset was written onto the fading gain");
  assert.equal(context.gains[2].gain.value, 1, "emitter gain is never ramped or reset");
  assert.deepEqual(context.gains[2].gain.ramps, []);
});


test("an explicit zero fade stops immediately; only a missing duration uses the default", async () =>
{
  const { context, emitter, backend } = Harness();
  const idA = backend.PostEvent(7, 1, 0, emitter, "shot_a");
  const idB = backend.PostEvent(8, 1, 0, emitter, "shot_b");
  const idC = backend.PostEvent(9, 1, 0, emitter, "shot_c");
  await tick();

  backend.ExecuteActionOnPlayingID("stop", idA, 0);
  assert.equal(context.gains[3].gain.value, 0, "zero fade silences at once");
  assert.deepEqual(context.gains[3].gain.ramps, [], "zero fade schedules no ramp");
  assert.equal(context.sources[0].stoppedAt, 0, "zero fade stops now, not after the default second");

  backend.ExecuteActionOnPlayingID("stop", idB);
  assert.deepEqual(context.gains[4].gain.ramps, [[0, 1]], "missing duration falls back to the 1s default");
  assert.equal(context.sources[1].stoppedAt, 1);

  backend.ExecuteActionOnPlayingID("stop", idC, 250);
  assert.deepEqual(context.gains[5].gain.ramps, [[0, 0.25]], "explicit nonzero duration is honored");
  assert.equal(context.sources[2].stoppedAt, 0.25);
});


test("pending sources: stop finishes once, break lets a one-shot play out and halts a loop", async () =>
{
  const buffers = new Map();
  const { context, finished, emitter, backend } = Harness({
    loadBuffer: (eventID, eventName) =>
    {
      const deferred = Deferred();
      buffers.set(eventName, deferred);
      return deferred.promise;
    }
  });

  const stopped = backend.PostEvent(7, 1, 0, emitter, "shot_stopped");
  backend.ExecuteActionOnPlayingID("stop", stopped, 0);
  assert.deepEqual(finished, [stopped], "stopping a pending source finishes it immediately");
  buffers.get("shot_stopped").resolve({ fake: "buffer" });
  await tick();
  assert.equal(context.sources.length, 0, "a stopped pending source never starts");
  assert.deepEqual(finished, [stopped], "the finished callback fired exactly once");

  const broken = backend.PostEvent(8, 1, 0, emitter, "shot_broken");
  backend.ExecuteActionOnPlayingID("break", broken);
  assert.equal(backend.GetPlayingCount(), 1, "a broken pending one-shot stays alive");
  buffers.get("shot_broken").resolve({ fake: "buffer" });
  await tick();
  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0].started, true, "the broken one-shot plays out once its media resolves");
  assert.equal(context.sources[0].stoppedAt, null);

  const loop = backend.PostEvent(9, 1, 0, emitter, "engine_loop");
  backend.ExecuteActionOnPlayingID("break", loop, 0);
  assert.ok(finished.includes(loop), "a broken pending loop finishes like a stop");
  buffers.get("engine_loop").resolve({ fake: "buffer" });
  await tick();
  assert.equal(context.sources.length, 1, "the broken pending loop never starts");
});


test("UnregisterGameObj halts loaded sources and cancels in-flight loads", async () =>
{
  const pending = Deferred();
  let calls = 0;
  const { context, finished, emitter, backend } = Harness({
    loadBuffer: () => ++calls === 1 ? Promise.resolve({ fake: "buffer" }) : pending.promise
  });

  const loaded = backend.PostEvent(7, 1, 0, emitter, "shot_loaded");
  await tick();
  const inflight = backend.PostEvent(8, 1, 0, emitter, "shot_inflight");
  assert.equal(backend.GetPlayingCount(), 2);

  backend.UnregisterGameObj(1);

  assert.equal(backend.GetPlayingCount(), 0, "no playing record survives its emitter");
  assert.deepEqual(finished.sort(), [loaded, inflight].sort(), "both records finished exactly once");
  assert.equal(context.sources[0].stoppedAt, 0, "the loaded source halts immediately");

  pending.resolve({ fake: "buffer" });
  await tick();
  assert.equal(context.sources.length, 1, "the in-flight load never starts on the torn-down graph");
  assert.deepEqual(finished.sort(), [loaded, inflight].sort(), "resolution after teardown adds no callbacks");
});
