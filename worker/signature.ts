// GitHub signs each webhook body with the shared secret (X-Hub-Signature-256).
// crypto.subtle.verify compares in constant time.

export async function verifySignature(secret: string, body: ArrayBuffer, header: string | null): Promise<boolean> {
  const hex = header?.startsWith("sha256=") ? header.slice(7) : "";
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  const sig = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, sig, body);
}
