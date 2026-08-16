import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  getLocalePlugin,
  getSupportedLocales,
  registerLocale,
  resolveBrowserLocale,
} = await jiti.import("./registry.ts");
const { enLocale } = await jiti.import("./messages/en.ts");
const { trLocale } = await jiti.import("./messages/tr.ts");

function placeholders(message) {
  return [...message.matchAll(/\{[\w.-]+\}/g)].map((match) => match[0]).sort();
}

test("uses the first supported browser language and falls back to English", () => {
  assert.equal(resolveBrowserLocale(["zh-CN", "en-US"]), "zh-CN");
  assert.equal(resolveBrowserLocale(["zh", "en-US"]), "zh-CN");
  assert.equal(resolveBrowserLocale(["tr", "en-US"]), "tr");
  assert.equal(resolveBrowserLocale(["tr-TR", "zh-CN"]), "tr");
  assert.equal(resolveBrowserLocale(["en-US", "tr-TR"]), "en");
  assert.equal(resolveBrowserLocale(["fr-FR", "tr-TR"]), "tr");
  assert.equal(resolveBrowserLocale(["fr-FR", "zh-CN"]), "zh-CN");
  assert.equal(resolveBrowserLocale(["fr-FR"]), "en");
  assert.equal(resolveBrowserLocale([]), "en");
});

test("returns only registered locales", () => {
  assert.deepEqual(getSupportedLocales(), ["en", "tr", "zh-CN"]);
  assert.equal(getLocalePlugin("en").id, "en");
  assert.equal(getLocalePlugin("tr").label, "Türkçe");
  assert.equal(getLocalePlugin("missing"), undefined);
});

test("Turkish messages have exact English key and placeholder parity", () => {
  assert.deepEqual(Object.keys(trLocale.messages).sort(), Object.keys(enLocale.messages).sort());
  for (const [key, englishMessage] of Object.entries(enLocale.messages)) {
    assert.deepEqual(placeholders(trLocale.messages[key]), placeholders(englishMessage), key);
  }
});

test("allows a new locale plugin and rejects duplicate ids", () => {
  registerLocale({ id: "test", label: "Test", messages: { "common.ok": "OK" } });
  assert.equal(getLocalePlugin("test")?.label, "Test");
  assert.throws(() => registerLocale({ id: "test", label: "Again", messages: {} }));
});
