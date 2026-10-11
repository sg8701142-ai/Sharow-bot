import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createStateStore } from "../src/diablos/lib/state.js";

test("developer access persists across state-store restarts", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diablos-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const store = await createStateStore("!", "100", directory);
  assert.equal(store.isDeveloper("100"), true);
  assert.equal(store.isDeveloper("200"), false);
  assert.equal(await store.addDeveloper("200"), true);
  assert.equal(await store.addDeveloper("200"), false);
  await assert.rejects(store.removeDeveloper("100"), /المطوّر الأساسي/);
  assert.equal(await store.removeDeveloper("200"), true);
  assert.equal(store.isDeveloper("200"), false);
  assert.equal(await store.removeDeveloper("200"), false);
  assert.equal(await store.addDeveloper("200"), true);
  await assert.rejects(store.addDeveloper("not-a-number"), /غير صالح/);

  const restarted = await createStateStore("!", "100", directory);
  assert.equal(restarted.isDeveloper("100"), true);
  assert.equal(restarted.isDeveloper("200"), true);
  assert.deepEqual(restarted.getDeveloperIds().sort(), ["100", "200"]);
});
