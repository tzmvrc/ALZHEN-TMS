import test from "node:test";
import assert from "node:assert/strict";
import {
  validateContent,
  imageMime,
} from "../src/models/clientwebsite.validation.js";
const truck = {
  truckType: "10W",
  maxLoad: "20 tonnes",
  dimensions: "8 ft × 7.5 ft × 32 ft",
  images: [{ url: "https://example.com/truck.jpg", alt: "Truck" }],
  commonCargos: [
    {
      id: "cargo1",
      name: "Appliances",
      imageUrl: "https://example.com/cargo.jpg",
    },
  ],
};
test("truck types, custom names, image limit and cargo names are validated", () => {
  assert.equal(validateContent("trucks", truck).name, "10-Wheeler Wing Van");
  assert.equal(
    validateContent("trucks", {
      ...truck,
      truckType: "OTHER",
      otherTruckType: "Refrigerated van",
    }).name,
    "Refrigerated van",
  );
  for (const value of [
    { ...truck, truckType: "invalid" },
    { ...truck, truckType: "OTHER" },
    { ...truck, images: [] },
    { ...truck, images: Array(4).fill(truck.images[0]) },
    { ...truck, maxLoad: "" },
    { ...truck, commonCargos: [{ id: "a", name: "" }] },
  ])
    assert.throws(() => validateContent("trucks", value));
  assert.throws(() =>
    validateContent("trucks", {
      ...truck,
      commonCargos: [truck.commonCargos[0], truck.commonCargos[0]],
    }),
  );
});
test("unsafe image URLs and invalid dates are rejected; text is kept as plain text", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "//example.com/x",
    "https://user:password@example.com/a",
  ])
    assert.throws(() =>
      validateContent("trucks", { ...truck, images: [{ url }] }),
    );
  const announcement = {
    title: "Service update",
    content: "<script>alert(1)</script>",
    date: "2026-09-27",
    imageUrl: "",
  };
  assert.equal(
    validateContent("announcements", announcement).content,
    announcement.content,
  );
  assert.throws(() =>
    validateContent("announcements", { ...announcement, date: "2026-02-30" }),
  );
  assert.throws(() =>
    validateContent("announcements", { ...announcement, content: "" }),
  );
});
test("upload signature rejects HTML and SVG masquerading as photos", () => {
  assert.equal(imageMime(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  assert.equal(imageMime(Buffer.from([255, 216, 255, 224])), "image/jpeg");
  assert.equal(
    imageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.equal(imageMime(Buffer.from("RIFF0000WEBP")), "image/webp");
});
