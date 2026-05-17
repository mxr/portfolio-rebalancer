export type Row = {
  id: string;
  ticker: string;
  current: string;
  target: string;
};

export type SortKey = "ticker" | "current" | "target" | "amount";
export type SortState = {
  key: SortKey;
  direction: "asc" | "desc";
};

export type Totals = {
  totalCurrent: number;
  nonCashTarget: number;
  cashTarget: number;
};

export type TradeSummary = {
  buys: { ticker: string; amount: number }[];
  sells: { ticker: string; amount: number }[];
};

export type FidelityCsvPosition = {
  ticker: string;
  current: number;
  costBasis: number | null;
};

export type EstSaleGain = {
  ticker: string;
  sellAmount: number;
  estGain: number;
};

export const makeRowId = (index: number) => `row-${index}`;

export const createRow = (id: string): Row => ({
  id,
  ticker: "",
  current: "",
  target: "",
});

export const DEFAULT_ROWS: Row[] = [
  { id: makeRowId(0), ticker: "CASH", current: "1500", target: "" },
  { id: makeRowId(1), ticker: "AAPL", current: "12500", target: "35" },
  { id: makeRowId(2), ticker: "MSFT", current: "9800", target: "30" },
  { id: makeRowId(3), ticker: "TLT", current: "6200", target: "20" },
];

export const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sanitizeTickerInput = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const sanitizeDecimalInput = (value: string) => {
  const numeric = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...fractionParts] = numeric.split(".");
  const fraction = fractionParts.join("").slice(0, 2);
  if (numeric.includes(".")) {
    return `${whole}.${fraction}`;
  }
  return whole;
};

export const sanitizeCurrencyInput = (value: string) => sanitizeDecimalInput(value);

export const sanitizeTargetPercentInput = (value: string) => sanitizeDecimalInput(value);

const normDecimalOnBlur = (value: string, sanitize: (next: string) => string, padSingleDecimalPlace: boolean) => {
  let norm = sanitize(value);
  if (!norm || norm === ".") {
    return "";
  }
  if (norm.startsWith(".")) {
    norm = `0${norm}`;
  }
  if (norm.endsWith(".")) {
    norm = norm.slice(0, -1);
  }
  const [wholeRaw = "", fractionPart] = norm.split(".");
  const strippedWhole = wholeRaw.replace(/^0+(?=\d)/, "");
  norm = fractionPart !== undefined ? `${strippedWhole}.${fractionPart}` : strippedWhole;
  if (/^\d+\.00$/.test(norm)) {
    return norm.slice(0, -3);
  }
  if (padSingleDecimalPlace && /^\d+\.\d$/.test(norm)) {
    return `${norm}0`;
  }
  return norm;
};

export const normCurrencyOnBlur = (value: string) => normDecimalOnBlur(value, sanitizeCurrencyInput, true);

export const normPercentOnBlur = (value: string) => {
  return normDecimalOnBlur(value, sanitizeTargetPercentInput, false);
};

export const parseCurrency = (value: string) => {
  const norm = value.replace(/[$,]/g, "").trim();
  const parsed = Number(norm);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

export const formatPercent = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

export const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

export const isCsvFile = (name: string, type: string) => type === "text/csv" || name.toLowerCase().endsWith(".csv");

export const isCsvSizeOk = (size: number, maxBytes = 2 * 1024 * 1024) => size <= maxBytes;

export const isCsvRowCountOk = (text: string, maxRows = 5000) => text.split(/\r?\n/).filter(Boolean).length <= maxRows;

export const getNextRowIndex = (rows: Row[]) => {
  const maxIndex = rows.reduce((max, row) => {
    const match = row.id.match(/^row-(\d+)$/);
    if (!match) {
      return max;
    }
    const index = Number(match[1]);
    return Number.isFinite(index) ? Math.max(max, index) : max;
  }, -1);
  return maxIndex + 1;
};

export const serializeRows = (rows: Row[], cashTarget: number) =>
  rows
    .filter((row) => row.ticker || row.current || row.target)
    .map((row, index) => {
      const target = index === 0 ? cashTarget.toFixed(2) : row.target;
      return [row.ticker, row.current, target].join("|");
    })
    .join(";");

export const parseRows = (value: string | null) => {
  if (!value) {
    return null;
  }

  const rows = value
    .split(";")
    .map((entry) => entry.split("|"))
    .filter((entry) => entry.some((item) => item.trim().length > 0))
    .map(([ticker = "", current = "", target = ""], index) => ({
      id: makeRowId(index),
      ticker: sanitizeTickerInput(ticker),
      current: sanitizeCurrencyInput(current),
      target: sanitizeTargetPercentInput(target),
    }));

  return rows.length > 0 ? rows : null;
};

export const normRows = (rows: Row[] | null): Row[] => {
  if (!rows || rows.length === 0) {
    // Unreachable in normal usage because the UI always maintains a CASH row.
    return [{ id: makeRowId(0), ticker: "CASH", current: "", target: "" }];
  }

  const cashCandidate = rows.find((row) => row.ticker.toUpperCase() === "CASH");
  const [first, ...rest] = rows;
  const cashRow = {
    id: cashCandidate?.id ?? first.id ?? makeRowId(0),
    ticker: "CASH",
    current: cashCandidate?.current ?? "",
    target: "",
  };
  const restRows = rest.filter((row) => row.ticker.toUpperCase() !== "CASH");
  return [cashRow, ...restRows];
};

export const computeTotals = (rows: Row[]): Totals => {
  const totalCurrent = rows.reduce((sum, row) => sum + toNumber(row.current), 0);
  const nonCashTarget = rows.slice(1).reduce((sum, row) => sum + toNumber(row.target), 0);
  const cashTarget = Math.max(0, 100 - nonCashTarget);
  return { totalCurrent, nonCashTarget, cashTarget };
};

export const computeSortOrder = (rows: Row[], totals: Totals, key: SortKey, direction: "asc" | "desc") => {
  const rest = rows.slice(1);
  const getTargetValue = (row: Row) => toNumber(row.target);
  const getAmountValue = (row: Row) => {
    const current = toNumber(row.current);
    const desired = totals.totalCurrent * (getTargetValue(row) / 100);
    return Math.abs(desired - current);
  };

  const compare = (a: Row, b: Row) => {
    let result = 0;
    switch (key) {
      case "ticker":
        result = a.ticker.localeCompare(b.ticker);
        break;
      case "current":
        result = toNumber(a.current) - toNumber(b.current);
        break;
      case "target":
        result = getTargetValue(a) - getTargetValue(b);
        break;
      case "amount":
        result = getAmountValue(a) - getAmountValue(b);
        break;
      default: {
        key satisfies never;
        throw new Error("Unreachable");
      }
    }

    return direction === "asc" ? result : -result;
  };

  return [...rest].sort(compare).map((row) => row.id);
};

export const computeTradeSummary = (rows: Row[], totals: Totals): TradeSummary => {
  const buys: { ticker: string; amount: number }[] = [];
  const sells: { ticker: string; amount: number }[] = [];

  rows.slice(1).forEach((row) => {
    const current = toNumber(row.current);
    const target = toNumber(row.target);
    const desired = totals.totalCurrent * (target / 100);
    const delta = desired - current;
    if (Math.abs(delta) < 0.01) {
      return;
    }
    if (delta > 0) {
      buys.push({ ticker: row.ticker || "—", amount: delta });
    } else {
      sells.push({ ticker: row.ticker || "—", amount: Math.abs(delta) });
    }
  });

  buys.sort((a, b) => b.amount - a.amount);
  sells.sort((a, b) => b.amount - a.amount);

  return { buys, sells };
};

export const computeEstSaleGains = (sells: { ticker: string; amount: number }[], csvPositions: FidelityCsvPosition[]) => {
  const positionByTicker = new Map(csvPositions.map((position) => [position.ticker.toUpperCase(), position]));
  const gains: EstSaleGain[] = [];

  sells.forEach((sell) => {
    const position = positionByTicker.get(sell.ticker.toUpperCase());
    if (!position || position.current <= 0 || position.costBasis === null) {
      return;
    }
    const gainRatio = (position.current - position.costBasis) / position.current;
    gains.push({
      ticker: sell.ticker,
      sellAmount: sell.amount,
      estGain: sell.amount * gainRatio,
    });
  });

  return gains;
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
};

export const parseFidelityCsv = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerIndex = lines.findIndex((line) => line.toLowerCase().startsWith("account number,"));
  if (headerIndex === -1) {
    return {
      cashCurrent: 0,
      positions: [] as FidelityCsvPosition[],
      pendingActivity: null,
    };
  }

  const header = parseCsvLine(lines[headerIndex]).map((value) => value.toLowerCase());
  const symbolIndex = header.indexOf("symbol");
  const descIndex = header.indexOf("description");
  const currentIndex = header.indexOf("current value");
  const costBasisIndex = header.indexOf("cost basis total");

  if (symbolIndex === -1 || currentIndex === -1) {
    return {
      cashCurrent: 0,
      positions: [] as FidelityCsvPosition[],
      pendingActivity: null,
    };
  }

  const positions: FidelityCsvPosition[] = [];
  const positionMap = new Map<string, { current: number; costBasis: number | null }>();
  let cashCurrent = 0;
  let pendingActivity: number | null = null;

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('"The data and information') || line.startsWith('"Brokerage services') || line.startsWith('"Date downloaded')) {
      break;
    }

    const fields = parseCsvLine(line);
    const symbol = fields[symbolIndex] ?? "";
    const desc = descIndex >= 0 ? (fields[descIndex] ?? "") : "";
    const currentRaw = fields[currentIndex] ?? "";
    const costBasisRaw = costBasisIndex >= 0 ? (fields[costBasisIndex] ?? "") : "";
    const current = parseCurrency(currentRaw);
    const costBasis = costBasisIndex >= 0 ? parseCurrency(costBasisRaw) : null;

    const isPending = symbol.trim().toUpperCase() === "PENDING ACTIVITY" || /pending activity/i.test(desc);
    const isCash = isPending || symbol.trim().length === 0 || symbol.includes("**") || /money market/i.test(desc) || /cash/i.test(desc);

    if (isCash) {
      cashCurrent += current;
      if (isPending) {
        pendingActivity = (pendingActivity ?? 0) + current;
      }
      continue;
    }

    const ticker = sanitizeTickerInput(symbol.trim());
    if (!ticker) {
      continue;
    }
    const previous = positionMap.get(ticker);
    const nextCurrent = (previous?.current ?? 0) + current;
    const nextCostBasis = costBasis === null ? (previous?.costBasis ?? null) : (previous?.costBasis ?? 0) + costBasis;
    positionMap.set(ticker, { current: nextCurrent, costBasis: nextCostBasis });
  }

  for (const [ticker, values] of positionMap.entries()) {
    positions.push({
      ticker,
      current: values.current,
      costBasis: values.costBasis,
    });
  }

  return { cashCurrent, positions, pendingActivity };
};
