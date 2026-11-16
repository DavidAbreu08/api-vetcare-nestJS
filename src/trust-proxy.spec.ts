import { parseTrustProxy } from "./trust-proxy";

describe("parseTrustProxy (TRUST_PROXY)", () => {
  it("is disabled by default and for false or blank values", () => {
    for (const raw of [undefined, "", "  ", "false", "FALSE", " , "]) expect(parseTrustProxy(raw)).toBe(false);
  });

  it("accepts true, a hop count or a list of addresses and subnets", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy(" 1 ")).toBe(1);
    expect(parseTrustProxy("0")).toBe(0);
    expect(parseTrustProxy("loopback, 10.0.0.0/8,192.168.1.10")).toEqual(["loopback", "10.0.0.0/8", "192.168.1.10"]);
  });
});
