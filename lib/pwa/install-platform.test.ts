import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectInstallPlatformFromUserAgent, normalizeInstallPlatform } from "./install-platform";

describe("detectInstallPlatformFromUserAgent", () => {
  it("detects Android", () => {
    assert.equal(
      detectInstallPlatformFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36"
      ),
      "android"
    );
  });

  it("detects iPhone and iPadOS Safari", () => {
    assert.equal(
      detectInstallPlatformFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      ),
      "ios"
    );
    assert.equal(
      detectInstallPlatformFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
        { maxTouchPoints: 5 }
      ),
      "ios"
    );
  });

  it("detects Windows and macOS desktop", () => {
    assert.equal(
      detectInstallPlatformFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
      ),
      "windows"
    );
    assert.equal(
      detectInstallPlatformFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
      ),
      "mac"
    );
  });
});

describe("normalizeInstallPlatform", () => {
  it("accepts known platform slugs only", () => {
    assert.equal(normalizeInstallPlatform("android"), "android");
    assert.equal(normalizeInstallPlatform("IOS"), "ios");
    assert.equal(normalizeInstallPlatform("linux"), null);
    assert.equal(normalizeInstallPlatform(null), null);
  });
});

