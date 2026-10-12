import { describe, expect, it } from "vitest";
import { verifySignature } from "../worker/signature";

const body = new TextEncoder().encode('{"zen":"Keep it logically awesome."}').buffer;

// Signs the way GitHub does: HMAC-SHA256 of the raw body, as "sha256=<hex>".
async function sign(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifySignature", () => {
  it("accepts GitHub's signature", async () => expect(await verifySignature("s3cret", body, await sign("s3cret"))).toBe(true));
  it("rejects a different secret", async () => expect(await verifySignature("s3cret", body, await sign("other"))).toBe(false));
  it("rejects a missing header", async () => expect(await verifySignature("s3cret", body, null)).toBe(false));
  it("rejects a malformed header", async () => expect(await verifySignature("s3cret", body, "sha1=abc")).toBe(false));
});
