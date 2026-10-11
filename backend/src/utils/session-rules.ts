import { createHash, timingSafeEqual } from "node:crypto";

const MANILA_TIME_ZONE = "Asia/Manila";

export function nextManilaMidnight(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  const targetDate = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;

  // Convert the target Manila wall-clock midnight into UTC using the zone's
  // actual offset for that date instead of the browser/server local timezone.
  const guess = new Date(`${targetDate}T00:00:00.000Z`);
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const values = Object.fromEntries(localParts.map(({ type, value }) => [type, value]));
  const representedAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  return new Date(guess.getTime() - (representedAsUtc - guess.getTime()));
}

export function sha256SessionIdentifier(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sessionHashesMatch(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

