import assert from "node:assert/strict";
import test from "node:test";
import { MAX_OFFLOAD_IMAGES, MAX_REPORT_IMAGE_BYTES, selectReportImages, validateReportImage } from "../src/services/report-image-selection.ts";

const image = (name: string, type = "image/png", size = 12) => new File([new Uint8Array(size)], name, { type, lastModified: 1 });

test("Offload image selection accepts five distinct images and reports the sixth without replacing selections", () => {
  const first = [image("1.png"), image("2.png")];
  const result = selectReportImages(first, [image("3.png"), image("4.png"), image("5.png"), image("6.png")], MAX_OFFLOAD_IMAGES);
  assert.deepEqual(result.files.map((file) => file.name), ["1.png", "2.png", "3.png", "4.png", "5.png"]);
  assert.match(result.errors[0], /6.png.*up to 5/);
  assert.equal(first.length, 2, "the original selection is not mutated");
});

test("invalid image files receive per-file errors while valid images and zero-or-more existing selections are retained", () => {
  const result = selectReportImages([image("saved.png")], [image("bad.svg", "image/svg+xml"), image("empty.png", "image/png", 0), image("big.png", "image/png", MAX_REPORT_IMAGE_BYTES + 1), image("good.jpg", "image/jpeg")], MAX_OFFLOAD_IMAGES);
  assert.deepEqual(result.files.map((file) => file.name), ["saved.png", "good.jpg"]);
  assert.equal(result.errors.length, 3);
  assert.ok(result.errors.every((message) => /bad.svg|empty.png|big.png/.test(message)));
  assert.equal(validateReportImage(image("boundary.webp", "image/webp", MAX_REPORT_IMAGE_BYTES)), null);
});

test("reselecting a file is deduplicated and removing one makes capacity available", () => {
  const files = Array.from({ length: 5 }, (_, index) => image(`${index}.png`));
  const duplicate = selectReportImages(files, [files[0]], MAX_OFFLOAD_IMAGES);
  assert.equal(duplicate.files.length, 5);
  assert.deepEqual(duplicate.errors, []);
  const afterRemoval = files.filter((_, index) => index !== 2);
  const next = selectReportImages(afterRemoval, [image("new.png")], MAX_OFFLOAD_IMAGES);
  assert.equal(next.files.length, 5);
  assert.equal(next.files.some((file) => file.name === "2.png"), false);
  assert.equal(next.files.at(-1)?.name, "new.png");
});
