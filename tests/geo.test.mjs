// Pure-logic tests for the geofence maths (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";

const R = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;
function haversine(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

test("zero distance", () => assert.equal(haversine(25.5357, 84.8512, 25.5357, 84.8512), 0));
test("~111 m per 0.001° latitude", () => {
  const d = haversine(25.5357, 84.8512, 25.5367, 84.8512);
  assert.ok(Math.abs(d - 111.2) < 1, `got ${d}`);
});
test("Patna city ↔ IIT Patna Bihta is ~30–40 km", () => {
  const d = haversine(25.5941, 85.1376, 25.5357, 84.8512);
  assert.ok(d > 25000 && d < 40000, `got ${d}`);
});
