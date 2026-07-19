import test from "node:test";
import assert from "node:assert/strict";
import { CjsSchema } from "@carbonenginejs/core-types/schema";
import {
  AudEmitter,
  AudEventCurve,
  AudEventKey,
  AudGameObjResource,
  AudioCurveSetDriver,
  AudListener,
  AudManager,
  AudParameter,
  StretchAudio,
  Tr2AudioStretchAuto,
  Tr2AudioStretchBase
} from "../npm/dist/index.js";


test("real Carbon audio classes are exported with their Carbon families", () =>
{
  const expectations = [
    [AudGameObjResource, "AudGameObjResource", "audio"],
    [AudEmitter, "AudEmitter", "audio"],
    [AudListener, "AudListener", "audio"],
    [AudEventCurve, "AudEventCurve", "audio"],
    [AudEventKey, "AudEventKey", "audio"],
    [AudParameter, "AudParameter", "audio"],
    [AudioCurveSetDriver, "AudioCurveSetDriver", "audio"],
    [AudManager, "AudManager", "audio"],
    [StretchAudio, "StretchAudio", "audio"],
    [Tr2AudioStretchBase, "Tr2AudioStretchBase", "trinityAudio"],
    [Tr2AudioStretchAuto, "Tr2AudioStretchAuto", "trinityAudio"]
  ];

  for (const [Constructor, className, family] of expectations)
  {
    assert.equal(CjsSchema.getClassName(Constructor), className, `${className} schema className`);
    assert.equal(CjsSchema.getClassFamily(Constructor), family, `${className} family`);
  }

  // Carbon base-class relationships survive generation.
  assert.ok(new AudEmitter() instanceof AudGameObjResource, "AudEmitter extends AudGameObjResource");
  assert.ok(new AudListener() instanceof AudGameObjResource, "AudListener extends AudGameObjResource");
  assert.ok(new Tr2AudioStretchAuto() instanceof Tr2AudioStretchBase, "Tr2AudioStretchAuto extends Tr2AudioStretchBase");
});


test("audio graph hydrates and round-trips headlessly", () =>
{
  // The whole point of the data layer: no AudioContext exists here.
  assert.equal(typeof globalThis.AudioContext, "undefined");

  const emitter = AudEmitter.from({
    name: "locator_audio_engine_01",
    eventPrefix: "ship_",
    scalingFactor: 2.5,
    position: [1, 2, 3]
  });
  assert.equal(emitter.name, "locator_audio_engine_01");
  assert.equal(emitter.eventPrefix, "ship_");
  assert.equal(emitter.scalingFactor, 2.5);

  const values = emitter.GetValues();
  assert.equal(values.name, "locator_audio_engine_01");
  assert.equal(values.eventPrefix, "ship_");
  assert.equal(values.scalingFactor, 2.5);
  // position is an [AUTHORED] promotion (kb.md authored-value rule): Blue
  // routes it through Initialize(name, prefix, position), the JS graph
  // serializes it.
  assert.deepEqual(Array.from(values.position), [1, 2, 3]);
});


test("AudEventCurve hydrates typed AudEventKey children", () =>
{
  const curve = AudEventCurve.from({
    name: "boost",
    keys: [{ time: 0.5, value: "play_boost" }]
  });
  assert.ok(curve.keys[0] instanceof AudEventKey, "keys hydrate as AudEventKey");
  assert.equal(curve.keys[0].time, 0.5);

  const values = curve.GetValues();
  assert.equal(values.keys[0].value, "play_boost");
});


test("schema canary: field metadata survives", () =>
{
  // Field metadata registers on first construction of the declaring class.
  new AudGameObjResource();
  new AudEmitter();

  assert.equal(CjsSchema.getField(AudGameObjResource, "eventPrefix").type.kind, "string");
  assert.equal(CjsSchema.getField(AudEmitter, "maxNormalizedValue").type.kind, "float32");

  // Promoted fields carry machine-readable divergence metadata: the authored
  // exposure is an implementation decision, stamped impl.adapted + reason.
  const position = CjsSchema.getField(AudGameObjResource, "position");
  assert.equal(position.impl.status, "adapted");
  assert.match(position.impl.reason, /outside Blue serialization/);
  // A faithful Blue field carries no impl metadata.
  assert.equal(CjsSchema.getField(AudGameObjResource, "eventPrefix").impl, undefined);
});
