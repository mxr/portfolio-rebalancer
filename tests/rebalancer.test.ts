import { describe, expect, it } from "vitest";
import {
  arraysEqual,
  createRow,
  computeSortOrder,
  computeTotals,
  computeTradeSummary,
  DEFAULT_ROWS,
  formatPercent,
  formatCurrency,
  makeRowId,
  normalizeRows,
  parseFidelityCsv,
  parseRows,
  parseCurrency,
  serializeRows,
  toNumber,
  getNextRowIndex,
} from "../lib/rebalancer";

describe("rebalancer helpers", () => {
  it("normalizes rows to ensure CASH is first and unique", () => {
    const rows = [
      { id: makeRowId(1), ticker: "VTI", current: "100", target: "50" },
      { id: makeRowId(2), ticker: "CASH", current: "25", target: "0" },
      { id: makeRowId(3), ticker: "CASH", current: "30", target: "0" },
    ];
    const normalized = normalizeRows(rows);
    expect(normalized[0].ticker).toBe("CASH");
    expect(normalized[0].current).toBe("25");
    expect(normalized.filter((row) => row.ticker === "CASH")).toHaveLength(1);
  });

  it("returns a default CASH row when input is empty", () => {
    const normalized = normalizeRows(null);
    expect(normalized).toEqual([
      { id: makeRowId(0), ticker: "CASH", current: "", target: "" },
    ]);
  });

  it("serializes and parses rows with cash target", () => {
    const rows = DEFAULT_ROWS.map((row) => ({ ...row }));
    const totals = computeTotals(rows);
    const encoded = serializeRows(rows, totals.cashTarget);
    const parsed = parseRows(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed?.[0].ticker).toBe("CASH");
  });

  it("ignores empty rows during serialization", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "", target: "" },
      { id: makeRowId(1), ticker: "", current: "", target: "" },
      { id: makeRowId(2), ticker: "AAA", current: "10", target: "5" },
    ];
    const encoded = serializeRows(rows, 95);
    expect(encoded).toContain("CASH");
    expect(encoded).toContain("AAA");
    expect(encoded.split(";")).toHaveLength(2);
  });

  it("handles empty parseRows input", () => {
    expect(parseRows(null)).toBeNull();
    expect(parseRows("")).toBeNull();
  });

  it("computes totals and cash target", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "1000", target: "" },
      { id: makeRowId(1), ticker: "AAPL", current: "500", target: "40" },
      { id: makeRowId(2), ticker: "MSFT", current: "500", target: "20" },
    ];
    const totals = computeTotals(rows);
    expect(totals.totalCurrent).toBe(2000);
    expect(totals.nonCashTarget).toBe(60);
    expect(totals.cashTarget).toBe(40);
  });

  it("computes trade summary buys and sells", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "1000", target: "" },
      { id: makeRowId(1), ticker: "AAA", current: "800", target: "30" },
      { id: makeRowId(2), ticker: "BBB", current: "200", target: "50" },
    ];
    const totals = computeTotals(rows);
    const summary = computeTradeSummary(rows, totals);
    expect(summary.buys.map((item) => item.ticker)).toContain("BBB");
    expect(summary.sells.map((item) => item.ticker)).toContain("AAA");
  });

  it("ignores negligible trade deltas", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "500", target: "" },
      { id: makeRowId(1), ticker: "AAA", current: "500", target: "50" },
    ];
    const totals = computeTotals(rows);
    const summary = computeTradeSummary(rows, totals);
    expect(summary.buys).toHaveLength(0);
    expect(summary.sells).toHaveLength(0);
  });

  it("sorts by ticker and current", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "0", target: "" },
      { id: makeRowId(1), ticker: "ZZZ", current: "1", target: "10" },
      { id: makeRowId(2), ticker: "AAA", current: "2", target: "20" },
    ];
    const totals = computeTotals(rows);
    const byTicker = computeSortOrder(rows, totals, "ticker", "asc");
    expect(byTicker).toEqual([makeRowId(2), makeRowId(1)]);
    const byCurrent = computeSortOrder(rows, totals, "current", "desc");
    expect(byCurrent).toEqual([makeRowId(2), makeRowId(1)]);
  });

  it("sorts by trade amount", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "0", target: "" },
      { id: makeRowId(1), ticker: "AAA", current: "50", target: "10" },
      { id: makeRowId(2), ticker: "BBB", current: "10", target: "50" },
    ];
    const totals = computeTotals(rows);
    const byAmount = computeSortOrder(rows, totals, "amount", "desc");
    expect(byAmount).toEqual([makeRowId(1), makeRowId(2)]);
  });

  it("sorts by target allocation", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "0", target: "" },
      { id: makeRowId(1), ticker: "AAA", current: "10", target: "40" },
      { id: makeRowId(2), ticker: "BBB", current: "10", target: "20" },
    ];
    const totals = computeTotals(rows);
    const byTarget = computeSortOrder(rows, totals, "target", "asc");
    expect(byTarget).toEqual([makeRowId(2), makeRowId(1)]);
  });

  it("computes next row index from mixed ids", () => {
    const rows = [
      { id: "custom", ticker: "CASH", current: "", target: "" },
      { id: makeRowId(3), ticker: "AAA", current: "1", target: "10" },
    ];
    expect(getNextRowIndex(rows)).toBe(4);
  });

  it("parses numbers and currency safely", () => {
    expect(toNumber("not-a-number")).toBe(0);
    expect(parseCurrency("$1,234.56")).toBeCloseTo(1234.56);
  });

  it("formats currency in USD", () => {
    expect(formatCurrency(12.5)).toContain("$");
  });

  it("arraysEqual checks length and order", () => {
    expect(arraysEqual(["a"], ["a", "b"])).toBe(false);
    expect(arraysEqual(["a", "b"], ["a", "b"])).toBe(true);
  });

  it("creates blank rows with provided id", () => {
    const row = createRow("row-9");
    expect(row).toEqual({ id: "row-9", ticker: "", current: "", target: "" });
  });

  it("formats percentages without trailing zeros", () => {
    expect(formatPercent(10)).toBe("10");
    expect(formatPercent(10.25)).toBe("10.25");
  });

  it("handles Fidelity CSV with missing headers", () => {
    const csv = ["Symbol,Description", "AAA,Alpha"].join("\n");
    const parsed = parseFidelityCsv(csv);
    expect(parsed.positions).toEqual([]);
  });

  it("handles Fidelity CSV without current value column", () => {
    const csv = [
      "Account Number,Account Name,Symbol,Description",
      "123,Account,AAA,ALPHA INC",
    ].join("\n");
    const parsed = parseFidelityCsv(csv);
    expect(parsed.positions).toEqual([]);
  });

  it("parses Fidelity CSV cash and positions", () => {
    const csv = [
      "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type",
      "123,Account,AAA,ALPHA INC,10,$10.00,+$0.10,$100.00,+$1.00,+1.00%,+$5.00,+5.00%,10.00%,$95.00,$9.50,Cash,",
      "123,Account,ACME,\"ACME, INC\",5,$20.00,+$0.10,$100.00,+$1.00,+1.00%,+$5.00,+5.00%,10.00%,$95.00,$9.50,Cash,",
      "123,Account,QUOT,\"ACME \"\"HOLDINGS\"\"\",5,$20.00,+$0.10,$150.00,+$1.00,+1.00%,+$5.00,+5.00%,10.00%,$95.00,$9.50,Cash,",
      "123,Account,FDRXX**,HELD IN MONEY MARKET,,,,$250.00,,,,,5.00%,,,Cash,",
      "\"Date downloaded Jan-27-2026 2:05 p.m ET\"",
    ].join("\n");

    const parsed = parseFidelityCsv(csv);
    expect(parsed.cashCurrent).toBeCloseTo(250);
    expect(parsed.positions).toEqual([
      { ticker: "AAA", current: 100 },
      { ticker: "ACME", current: 100 },
      { ticker: "QUOT", current: 150 },
    ]);
  });
});
