import { describe, it, expect, beforeEach } from "vitest";
import { lane } from "../src/routing.js";

describe("lane", () => {
  beforeEach(() => {
    delete process.env.QWEN_MODEL_FAST;
    delete process.env.QWEN_MODEL_CRITICAL;
  });
  it("defaults fast lane to the pinned qwen-flash snapshot", () => expect(lane("fast")).toBe("qwen-flash-2025-07-28"));
  it("defaults critical lane to qwen3.7-max", () => expect(lane("critical")).toBe("qwen3.7-max"));
  it("honors env overrides", () => {
    process.env.QWEN_MODEL_FAST = "qwen-turbo";
    expect(lane("fast")).toBe("qwen-turbo");
  });
});
