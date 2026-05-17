import { describe, expect, it } from "vitest";
import {
  arraysEqual,
  computeEstSaleGains,
  computeSortOrder,
  computeTotals,
  computeTradeSummary,
  createRow,
  DEFAULT_ROWS,
  formatCurrency,
  formatPercent,
  getNextRowIndex,
  isCsvFile,
  isCsvRowCountOk,
  isCsvSizeOk,
  makeRowId,
  normCurrencyOnBlur,
  normPercentOnBlur,
  normRows,
  parseCurrency,
  parseFidelityCsv,
  parseRows,
  sanitizeCurrencyInput,
  sanitizeTargetPercentInput,
  sanitizeTickerInput,
  serializeRows,
  toNumber,
} from "../lib/rebalancer";

describe("rebalancer helpers", () => {
  it("normalizes rows to ensure CASH is first and unique", () => {
    const rows = [
      { id: makeRowId(1), ticker: "VTI", current: "100", target: "50" },
      { id: makeRowId(2), ticker: "CASH", current: "25", target: "0" },
      { id: makeRowId(3), ticker: "CASH", current: "30", target: "0" },
    ];
    const norm = normRows(rows);
    expect(norm[0].ticker).toBe("CASH");
    expect(norm[0].current).toBe("25");
    expect(norm.filter((row) => row.ticker === "CASH")).toHaveLength(1);
  });

  it("returns a default CASH row when input is empty", () => {
    const norm = normRows(null);
    expect(norm).toEqual([{ id: makeRowId(0), ticker: "CASH", current: "", target: "" }]);
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

  it("sorts multiple buys and sells by descending amount and uses em-dash for empty tickers", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "0", target: "" },
      { id: makeRowId(1), ticker: "AAA", current: "900", target: "10" },
      { id: makeRowId(2), ticker: "BBB", current: "800", target: "5" },
      { id: makeRowId(3), ticker: "CCC", current: "100", target: "40" },
      { id: makeRowId(4), ticker: "", current: "50", target: "30" },
    ];
    const totals = computeTotals(rows);
    const summary = computeTradeSummary(rows, totals);
    expect(summary.sells[0].amount).toBeGreaterThanOrEqual(summary.sells[1]?.amount ?? 0);
    expect(summary.buys[0].amount).toBeGreaterThanOrEqual(summary.buys[1]?.amount ?? 0);
    expect(summary.buys.some((b) => b.ticker === "—")).toBe(true);
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

  it("computes estimated gains from sell trades using csv cost basis", () => {
    const gains = computeEstSaleGains(
      [
        { ticker: "AAA", amount: 30 },
        { ticker: "BBB", amount: 20 },
      ],
      [
        { ticker: "AAA", current: 100, costBasis: 80 },
        { ticker: "BBB", current: 200, costBasis: 220 },
      ],
    );
    expect(gains).toEqual([
      { ticker: "AAA", sellAmount: 30, estGain: 6 },
      { ticker: "BBB", sellAmount: 20, estGain: -2 },
    ]);
  });

  it("skips estimated gains for sells with no position, zero current, or null cost basis", () => {
    const gains = computeEstSaleGains(
      [
        { ticker: "MISSING", amount: 100 },
        { ticker: "ZERO", amount: 50 },
        { ticker: "NOBASIS", amount: 75 },
      ],
      [
        { ticker: "ZERO", current: 0, costBasis: 100 },
        { ticker: "NOBASIS", current: 200, costBasis: null },
      ],
    );
    expect(gains).toEqual([]);
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

  it("sanitizes ticker input to uppercase A-Z0-9", () => {
    expect(sanitizeTickerInput("aapl")).toBe("AAPL");
    expect(sanitizeTickerInput(" brk.b ")).toBe("BRKB");
    expect(sanitizeTickerInput("ms-ft$!")).toBe("MSFT");
  });

  it("sanitizes currency input to max two decimals", () => {
    expect(sanitizeCurrencyInput("12.3456")).toBe("12.34");
    expect(sanitizeCurrencyInput("$1,234.56")).toBe("1234.56");
    expect(sanitizeCurrencyInput("abc.9x1z2")).toBe(".91");
  });

  it("normalizes currency on blur", () => {
    expect(normCurrencyOnBlur("12.3")).toBe("12.30");
    expect(normCurrencyOnBlur("12.00")).toBe("12");
    expect(normCurrencyOnBlur(".5")).toBe("0.50");
    expect(normCurrencyOnBlur("10.")).toBe("10");
    expect(normCurrencyOnBlur("0012.30")).toBe("12.30");
    expect(normCurrencyOnBlur("00012")).toBe("12");
    expect(normCurrencyOnBlur("000.50")).toBe("0.50");
    expect(normCurrencyOnBlur("")).toBe("");
    expect(normCurrencyOnBlur(".")).toBe("");
  });

  it("sanitizes target percent input to max two decimals", () => {
    expect(sanitizeTargetPercentInput("10")).toBe("10");
    expect(sanitizeTargetPercentInput("10.5")).toBe("10.5");
    expect(sanitizeTargetPercentInput("10.67")).toBe("10.67");
    expect(sanitizeTargetPercentInput("10.")).toBe("10.");
    expect(sanitizeTargetPercentInput("abc12.599")).toBe("12.59");
  });

  it("normalizes target percent on blur", () => {
    expect(normPercentOnBlur("12.00")).toBe("12");
    expect(normPercentOnBlur("12.30")).toBe("12.30");
    expect(normPercentOnBlur(".5")).toBe("0.5");
    expect(normPercentOnBlur("10.")).toBe("10");
    expect(normPercentOnBlur("0012.30")).toBe("12.30");
    expect(normPercentOnBlur("00012")).toBe("12");
    expect(normPercentOnBlur("000.5")).toBe("0.5");
    expect(normPercentOnBlur("")).toBe("");
    expect(normPercentOnBlur(".")).toBe("");
  });

  it("throws when sort key is invalid at runtime", () => {
    const rows = [
      { id: makeRowId(0), ticker: "CASH", current: "0", target: "" },
      { id: makeRowId(1), ticker: "AAA", current: "10", target: "50" },
      { id: makeRowId(2), ticker: "BBB", current: "20", target: "50" },
    ];
    const totals = computeTotals(rows);
    expect(() => computeSortOrder(rows, totals, "invalid" as unknown as "ticker", "asc")).toThrow("Unreachable");
  });

  it("sanitizes parsed rows from URL state", () => {
    const parsed = parseRows("brk.b$|$100.999|12.678");
    expect(parsed).not.toBeNull();
    expect(parsed?.[0]).toEqual({
      id: makeRowId(0),
      ticker: "BRKB",
      current: "100.99",
      target: "12.67",
    });
  });

  it("formats currency in USD", () => {
    expect(formatCurrency(12.5)).toContain("$");
  });

  it("validates CSV file metadata", () => {
    expect(isCsvFile("positions.csv", "text/csv")).toBe(true);
    expect(isCsvFile("positions.CSV", "")).toBe(true);
    expect(isCsvFile("positions.txt", "text/plain")).toBe(false);
    expect(isCsvSizeOk(1024)).toBe(true);
    expect(isCsvSizeOk(2 * 1024 * 1024)).toBe(true);
    expect(isCsvSizeOk(2 * 1024 * 1024 + 1)).toBe(false);
  });

  it("validates CSV row count limits", () => {
    const text = ["a", "b", "c"].join("\n");
    expect(isCsvRowCountOk(text, 3)).toBe(true);
    expect(isCsvRowCountOk(text, 2)).toBe(false);
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
    expect(parsed.pendingActivity).toBeNull();
  });

  it("handles Fidelity CSV without current value column", () => {
    const csv = ["Account Number,Account Name,Symbol,Description", "123,Account,AAA,ALPHA INC"].join("\n");
    const parsed = parseFidelityCsv(csv);
    expect(parsed.positions).toEqual([]);
    expect(parsed.pendingActivity).toBeNull();
  });

  it("handles Fidelity CSV without pending activity rows", () => {
    const csv = [
      "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type",
      "123,Account,AAA,ALPHA INC,10,$10.00,+$0.10,$100.00,+$1.00,+1.00%,+$5.00,+5.00%,10.00%,$95.00,$9.50,Cash,",
      "123,Account,FDRXX**,HELD IN MONEY MARKET,,,,$250.00,,,,,5.00%,,,Cash,",
      '"Date downloaded Feb-06-2026 9:00 a.m ET"',
    ].join("\n");

    const parsed = parseFidelityCsv(csv);
    expect(parsed.pendingActivity).toBeNull();
  });

  it("parses Fidelity CSV cash and positions", () => {
    const csv = [
      "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type",
      "123,Account,AAA,ALPHA INC,10,$10.00,+$0.10,$100.00,+$1.00,+1.00%,+$5.00,+5.00%,10.00%,$95.00,$9.50,Cash,",
      '123,Account,ACME,"ACME, INC",5,$20.00,+$0.10,$100.00,+$1.00,+1.00%,+$5.00,+5.00%,10.00%,$95.00,$9.50,Cash,',
      '123,Account,QUOT,"ACME ""HOLDINGS""",5,$20.00,+$0.10,$150.00,+$1.00,+1.00%,+$5.00,+5.00%,10.00%,$95.00,$9.50,Cash,',
      "123,Account,PENDING ACTIVITY,PENDING ACTIVITY,,,,$42.00,,,,,0.00%,,,Cash,",
      "123,Account,FDRXX**,HELD IN MONEY MARKET,,,,$250.00,,,,,5.00%,,,Cash,",
      '"Date downloaded Jan-27-2026 2:05 p.m ET"',
    ].join("\n");

    const parsed = parseFidelityCsv(csv);
    expect(parsed.cashCurrent).toBeCloseTo(292);
    expect(parsed.pendingActivity).toBeCloseTo(42);
    expect(parsed.positions).toEqual([
      { ticker: "AAA", current: 100, costBasis: 95 },
      { ticker: "ACME", current: 100, costBasis: 95 },
      { ticker: "QUOT", current: 150, costBasis: 95 },
    ]);
  });

  it("skips non-cash CSV symbols that sanitize to empty tickers", () => {
    const csv = [
      "Account Number,Account Name,Symbol,Description,Current Value",
      "123,Account,@@@,ALPHA INC,$123.00",
      '"Date downloaded Jan-27-2026 2:05 p.m ET"',
    ].join("\n");

    const parsed = parseFidelityCsv(csv);
    expect(parsed.cashCurrent).toBe(0);
    expect(parsed.positions).toEqual([]);
    expect(parsed.pendingActivity).toBeNull();
  });
});
