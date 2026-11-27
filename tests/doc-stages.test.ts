import { describe, expect, it } from "vitest";
import { stageOfAction, isDocStage } from "@/lib/docs/bot-scan";
import { stageApprovalRule } from "@/lib/docs/stage";
import { paperOfType } from "@/lib/docs/transfer-papers";
import { BOTS, botOf, grokbotConfig, isScanJob, lineOf, SCAN_ACTION } from "@/lib/grokbot/client";
import { capacityFromEnv } from "@/lib/grokbot/store";

describe("three scanners, one queue each", () => {
  it("each stage has its own action and its own bot", () => {
    expect(SCAN_ACTION).toEqual({ in: "docs_scan", out: "docs_scan_out", transfer: "docs_scan_transfer" });
    expect([botOf("docs_scan"), botOf("docs_scan_out"), botOf("docs_scan_transfer"), botOf("ping")]).toEqual(["scan", "scan_out", "scan_transfer", "scan"]);
    expect(BOTS).toEqual(["scan", "scan_out", "scan_transfer"]);
    expect([stageOfAction("docs_scan"), stageOfAction("docs_scan_out"), stageOfAction("docs_scan_transfer"), stageOfAction("ping")]).toEqual(["in", "out", "transfer", null]);
    expect([isDocStage("out"), isDocStage("sold")]).toEqual([true, false]);
  });
  it("the id of every scan job is recognised", () => {
    for (const id of ["docs_scan-abc", "docs_scan_out-abc", "docs_scan_transfer-abc"]) expect(isScanJob(id), id).toBe(true);
    for (const id of ["ping-abc", "docs_scanner-abc", "docs_scan"]) expect(isScanJob(id), id).toBe(false);
  });
  it("a bot with its own address uses it; the others use the first scanner's", () => {
    const env = { GROKBOT_SCAN_WEBHOOK_URL: "https://a/x", GROKBOT_SCAN_WEBHOOK_SECRET: "s1", GROKBOT_CALLBACK_SECRET: "c", APP_BASE_URL: "https://mad", GROKBOT_SCAN_OUT_WEBHOOK_URL: "https://b/y", GROKBOT_SCAN_OUT_WEBHOOK_SECRET: "s2" };
    const cfg = grokbotConfig(env)!;
    expect(lineOf(cfg, "scan_out")).toEqual({ webhookUrl: "https://b/y", webhookSecret: "s2" });
    expect(lineOf(cfg, "scan_transfer").webhookUrl).toBe("https://a/x");
    expect(lineOf(cfg, "scan").webhookSecret).toBe("s1");
    expect(grokbotConfig({ ...env, GROKBOT_SCAN_OUT_WEBHOOK_SECRET: "" })!.lines).toBeUndefined(); // an address without its key is not used
  });
  it("each bot has its own number of places", () => {
    expect(capacityFromEnv({})).toEqual({ scan: 1, scan_out: 1, scan_transfer: 1 });
    expect(capacityFromEnv({ GROKBOT_SCAN_OUT_PARALLEL: "3", GROKBOT_SCAN_PARALLEL: "9" })).toEqual({ scan: 1, scan_out: 3, scan_transfer: 1 });
  });
});

describe("approving a stage (OUT or the transfer)", () => {
  const ok = { missing: [], pending: 0, failed: 0, flagged: 0, scanning: false };
  it("is allowed when everything is in, read and without a warning", () => {
    expect(stageApprovalRule(ok).allowed).toBe(true);
  });
  it("waits for the bot, with no way past it", () => {
    const r = stageApprovalRule({ ...ok, scanning: true });
    expect([r.allowed, r.adminOverride]).toEqual([false, false]);
  });
  it("says what is open, and lets an Admin go past it after a confirmation", () => {
    const r = stageApprovalRule({ missing: ["Buyer's ID"], pending: 2, failed: 1, flagged: 1, scanning: false });
    expect([r.allowed, r.adminOverride]).toEqual([false, true]);
    for (const part of ["2 photos not read yet", "1 photo could not be read", "still missing: Buyer's ID", "1 paper with a warning"]) expect(r.reason).toContain(part);
  });
});

describe("the papers back from the transfer", () => {
  it("what the scanner saw becomes one of the four papers", () => {
    expect([paperOfType("official_receipt"), paperOfType("certificate_of_registration"), paperOfType("pnp_clearance"), paperOfType("macro_etching")]).toEqual(["OR", "CR", "PNP clearance", "Macro-etching"]);
    expect([paperOfType("government_id"), paperOfType("other"), paperOfType(null)]).toEqual([null, null, null]);
  });
});
