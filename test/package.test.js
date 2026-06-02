import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

describe("npm package metadata", () => {
  it("is publishable and exposes the CLI binary", () => {
    expect(packageJson.private).toBeUndefined();
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.name).toBe("weixin-proxy-ilink");
    expect(packageJson.description).toContain("iLink protocol");
    expect(packageJson.author).toEqual({
      name: "kura",
      url: "https://kuraa.cc",
    });
    expect(packageJson.bin).toMatchObject({
      "wxilink": "./src/cli.js",
      "weixin-proxy-ilink": "./src/cli.js",
      "weixin-proxy": "./src/cli.js",
    });
  });

  it("ships only the runtime package surface", () => {
    expect(packageJson.main).toBe("./src/index.js");
    expect(packageJson.exports).toEqual({
      ".": "./src/index.js",
      "./package.json": "./package.json",
    });
    expect(packageJson.files).toEqual(["src/", "README.md", "LICENSE"]);
  });

  it("runs tests before packing", () => {
    expect(packageJson.scripts.prepack).toBe("npm test -- --run");
  });
});
