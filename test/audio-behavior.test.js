import test from "node:test";
import assert from "node:assert/strict";
import { CjsSchema } from "@carbonenginejs/core-types/schema";
import { AudEventCurve, AudEventKey, AudStaticDataRepository } from "../npm/dist/index.js";


test("AudStaticDataRepository catalogs audiometadata and answers Carbon queries", () =>
{
  const repository = new AudStaticDataRepository();
  assert.equal(repository.IsInitialized(), false);

  // Plain audio metadata shape (byte flags, numeric ids).
  repository.Initialize({
    Events: {
      ship_boost: {
        eventID: 12345,
        maxRadiusAttenuation: 100,
        isLoop: 1,
        is2D: 0,
        isVital: 0,
        eventsStoppedBy: ["ship_boost_stop"],
        soundbanks: ["ships.bnk"]
      }
    },
    SoundBanks: {
      "ships.bnk": { EssentialSoundBank: 0 },
      "init.bnk": { EssentialSoundBank: 1 }
    },
    WemFileIDs: {
      123456: { IsEssential: 1 }
    }
  });

  assert.equal(repository.IsInitialized(), true);
  assert.equal(repository.GetEventID("ship_boost"), 12345);
  assert.equal(repository.GetEventID("unknown_event"), 0, "AK_INVALID_UNIQUE_ID for unknown events");
  assert.equal(repository.GetEventRadiusSq("ship_boost"), 10000, "radius is squared on read");
  assert.equal(repository.GetEventRadiusSq("unknown_event"), 0);
  assert.equal(repository.EventIsLoop("ship_boost"), true);
  assert.equal(repository.EventIs2D("ship_boost"), false);
  assert.equal(repository.EventIsVital("unknown_event"), false);
  assert.equal(repository.EventIsStopped("ship_boost", "ship_boost_stop"), true);
  assert.equal(repository.EventIsStopped("ship_boost_stop", "ship_boost"), false);
  assert.deepEqual(repository.SoundBanksRequiredForEvent("ship_boost"), ["ships.bnk"]);
  assert.deepEqual(repository.SoundBanksRequiredForEvent("unknown_event"), []);
  assert.equal(repository.SoundBankIsEssential("init.bnk"), true);
  assert.equal(repository.SoundBankIsEssential("ships.bnk"), false);
  assert.equal(repository.SourceIsEssential(123456), true, "numeric wem ids resolve via string keys");
  assert.equal(repository.SourceIsEssential(999), false);
});


test("AudEventCurve key management matches Carbon semantics", () =>
{
  const curve = new AudEventCurve();

  curve.AddKey(2, "b");
  curve.AddKey(0.5, "a");
  assert.equal(curve.GetKeyCount(), 2);
  assert.equal(curve.GetKeyTime(0), 0.5, "keys resort on insert");
  assert.equal(curve.GetKeyValue(1), "b");
  assert.equal(curve.length, 2, "length tracks the last key");
  assert.ok(curve.keys[0] instanceof AudEventKey);

  assert.equal(curve.GetKeyTime(-1), 0, "out of range returns 0");
  assert.equal(curve.GetKeyValue(5), "", "out of range returns empty string");

  curve.SetKeyTime(0, 3);
  assert.equal(curve.GetKeyValue(0), "b", "SetKeyTime resorts");
  assert.equal(curve.length, 3);

  curve.RemoveKey(1);
  assert.equal(curve.GetKeyCount(), 1);
  assert.equal(curve.length, 2, "length refreshes from the remaining last key");

  // Carbon quirk preserved: removing the final key leaves length untouched.
  curve.RemoveKey(0);
  assert.equal(curve.GetKeyCount(), 0);
  assert.equal(curve.length, 2);
});


test("AudEventCurve.Initialize sorts hydrated keys and refreshes length", () =>
{
  const curve = AudEventCurve.from({
    keys: [
      { time: 5, value: "late" },
      { time: 1, value: "early" }
    ],
    extrapolation: AudEventCurve.TRIEXTRAPOLATION.TRIEXT_CYCLE
  });
  assert.equal(curve.Initialize(), true);
  assert.equal(curve.GetKeyValue(0), "early");
  assert.equal(curve.length, 5);

  // Org enum rule: the Carbon enum lives as a frozen static on its class.
  assert.equal(curve.extrapolation, 3);
  assert.equal(AudEventCurve.TRIEXTRAPOLATION.TRIEXT_NONE, 0);
  assert.ok(Object.isFrozen(AudEventCurve.TRIEXTRAPOLATION));
});


test("behavior method metadata reflects implementation status", () =>
{
  new AudEventCurve();
  new AudStaticDataRepository();

  assert.equal(CjsSchema.getMethod(AudEventCurve, "AddKey").impl.status, "implemented");
  assert.equal(CjsSchema.getMethod(AudEventCurve, "UpdateValue").impl.status, "notImplemented");
  assert.match(CjsSchema.getMethod(AudEventCurve, "SetSourceTriObserver").impl.reason, /defers emitter creation/);
  assert.equal(CjsSchema.getMethod(AudStaticDataRepository, "Initialize").impl.status, "adapted");
});

test("values-hydrated emitters count as positioned and can Wake", async () =>
{
  const { AudEmitter, AudGameObjResource } = await import("../npm/dist/index.js");
  const registered = [];
  AudGameObjResource.manager = {
    enabled: true,
    audioCullingEnabled: true,
    RegisterGameObject: (id, gameObject) => registered.push(id)
  };
  try
  {
    const emitter = AudEmitter.from({
      name: "Engine_SFX",
      eventPrefix: "ship_engine_S_",
      position: [0, 2, -69.5]
    });
    assert.equal(emitter.name, "Engine_SFX");
    assert.equal(emitter.eventPrefix, "ship_engine_S_");
    assert.equal(emitter.position[2], -69.5);

    emitter.Wake();
    assert.equal(emitter.IsCulled(), false, "hydrated position unblocks Wake");

    // Parity guard: a positionless hydration still refuses to Wake.
    const unplaced = AudEmitter.from({ name: "NoPosition" });
    unplaced.Wake();
    assert.equal(unplaced.IsCulled(), true, "positionless Wake stays a no-op");
  }
  finally
  {
    AudGameObjResource.manager = null;
  }
});
