import { describe, expect, it } from "vitest";
import { seeded } from "./pipeline-logic";
import { bot, botReply, nickname } from "./zone";

describe("KK Game Zone", () => {
  it("makes 2003-style nicknames, never one already at the table", () => {
    const rnd = seeded(2);
    const taken: string[] = [];
    for (let i = 0; i < 40; i++) {
      const n = nickname(rnd, taken);
      expect(n).toMatch(/^[a-z]+(_?[a-z0-9]+)$/);
      expect(taken).not.toContain(n);
      taken.push(n);
    }
  });

  it("bots carry the skill level you asked for", () => {
    expect(bot(2, seeded(1)).skill).toBe(2);
    expect(bot(0, seeded(1)).bot).toBe(true);
  });

  it("bots answer greetings and thanks", () => {
    expect(botReply("Hello!", seeded(1))).toBeTruthy();
    expect(botReply("Good game!", seeded(1))).toBeTruthy();
  });
});
