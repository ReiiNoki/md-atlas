import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOfficialMissionArchive } from "../src/domain/officialMissions.js";

const event = {
  id: "goruck-example",
  activityType: "goruck",
  detailPath: "data/official-mission-events/Z29ydWNrLWV4YW1wbGU.json",
};

test("additional archive data requires matching reviewed events and search text", () => {
  const payload = { meta: { eventCount: 1 }, events: [event] };
  assert.deepEqual(
    normalizeOfficialMissionArchive(payload, { "goruck-example": "scavenger hunt" }),
    { archive: payload, searchIndex: { "goruck-example": "scavenger hunt" } },
  );
  assert.throws(
    () => normalizeOfficialMissionArchive(payload, {}),
    /Incomplete additional archive event/,
  );
  assert.throws(
    () => normalizeOfficialMissionArchive(
      { meta: { eventCount: 1 }, events: [{ ...event, activityType: "md-standard" }] },
      { "goruck-example": "scavenger hunt" },
    ),
    /Invalid additional archive event/,
  );
});
