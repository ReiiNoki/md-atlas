import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventMapTitle, eventMapLocation } from "../src/utils/eventMapLabel.js";

const { events } = JSON.parse(readFileSync(new URL("../public/data/archive.json", import.meta.url), "utf8"));
const byId = (id) => events.find((event) => event.id === id);

test("map titles use banner titles rather than city or a mission prefix", () => {
  assert.equal(eventMapTitle(byId("md-2024-恆春-efd9")), "MD 2024: 恆春");
  assert.equal(eventMapTitle(byId("mdsss-mission-day-埼玉六宿-f249")), "<MDSSS>Mission Day 埼玉六宿");
  assert.equal(eventMapTitle({ city: "Fallback" }), "Fallback");
});

test("source addresses remain available for ordinary events", () => {
  const event = byId("md淡水-8a8c");
  assert.match(event.address, /新北市淡水區/);
  assert.equal(eventMapLocation(event), event.address);
  assert.equal(eventMapLocation({ countryCode: "JP", city: "Tokyo", country: "Japan" }), "Tokyo, 日本");
});

test("regional events do not mistake a pin's address for their entire range", () => {
  const scope = [
    ["md-2024-恆春-efd9", "恒春半岛", "恆春鎮鵝鑾里"],
    ["mdsss-mission-day-埼玉六宿-f249", "埼玉县", "草加"],
    ["md-2023-kanmon-kaikyo-ab81", "关门海峡", "下关市"],
    ["mdas-missionday-at-sea-f883", "开曼群岛", "劳德代尔堡"],
  ];
  for (const [id, expected, excluded] of scope) {
    const label = eventMapLocation(byId(id));
    assert.ok(label.includes(expected), `${id}: ${label}`);
    assert.ok(!label.includes(excluded), `${id}: ${label}`);
    assert.ok(eventMapLocation(byId(id), "ja"));
    assert.ok(eventMapLocation(byId(id), "en"));
  }
});

test("all published events have map titles and location text", () => {
  for (const event of events) {
    assert.ok(eventMapTitle(event));
    assert.ok(eventMapLocation(event));
  }
});
