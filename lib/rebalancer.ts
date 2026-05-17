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

export type EstimatedSaleGain = {
  ticker: string;
  sellAmount: number;
  estimatedGain: number;
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

const normalizeDecimalOnBlur = (value: string, sanitize: (next: string) => string, padSingleDecimalPlace: boolean) => {
  let normalized = sanitize(value);
  if (!normalized || normalized === ".") {
    return "";
  }
  if (normalized.startsWith(".")) {
    normalized = `0${normalized}`;
  }
  if (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }
  const [wholeRaw = "", fractionPart] = normalized.split(".");
  const strippedWhole = wholeRaw.replace(/^0+(?=\d)/, "");
  normalized = fractionPart !== undefined ? `${strippedWhole}.${fractionPart}` : strippedWhole;
  if (/^\d+\.00$/.test(normalized)) {
    return normalized.slice(0, -3);
  }
  if (padSingleDecimalPlace && /^\d+\.\d$/.test(normalized)) {
    return `${normalized}0`;
  }
  return normalized;
};

export const normalizeCurrencyOnBlur = (value: string) => normalizeDecimalOnBlur(value, sanitizeCurrencyInput, true);

export const normalizePercentOnBlur = (value: string) => {
  return normalizeDecimalOnBlur(value, sanitizeTargetPercentInput, false);
};

export const parseCurrency = (value: string) => {
  const normalized = value.replace(/[$,]/g, "").trim();
  const parsed = Number(normalized);
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
      const targetValue = index === 0 ? cashTarget.toFixed(2) : row.target;
      return [row.ticker, row.current, targetValue].join("|");
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

export const normalizeRows = (rows: Row[] | null): Row[] => {
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
  const filteredRest = rest.filter((row) => row.ticker.toUpperCase() !== "CASH");
  return [cashRow, ...filteredRest];
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
    const currentValue = toNumber(row.current);
    const desiredValue = totals.totalCurrent * (getTargetValue(row) / 100);
    return Math.abs(desiredValue - currentValue);
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
    const currentValue = toNumber(row.current);
    const targetValue = toNumber(row.target);
    const desiredValue = totals.totalCurrent * (targetValue / 100);
    const delta = desiredValue - currentValue;
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

export const computeEstimatedSaleGains = (sells: { ticker: string; amount: number }[], csvPositions: FidelityCsvPosition[]) => {
  const positionByTicker = new Map(csvPositions.map((position) => [position.ticker.toUpperCase(), position]));
  const gains: EstimatedSaleGain[] = [];

  sells.forEach((sell) => {
    const position = positionByTicker.get(sell.ticker.toUpperCase());
    if (!position || position.current <= 0 || position.costBasis === null) {
      return;
    }
    const gainRatio = (position.current - position.costBasis) / position.current;
    gains.push({
      ticker: sell.ticker,
      sellAmount: sell.amount,
      estimatedGain: sell.amount * gainRatio,
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
  const descriptionIndex = header.indexOf("description");
  const currentValueIndex = header.indexOf("current value");
  const costBasisTotalIndex = header.indexOf("cost basis total");

  if (symbolIndex === -1 || currentValueIndex === -1) {
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
    const description = descriptionIndex >= 0 ? (fields[descriptionIndex] ?? "") : "";
    const currentValue = fields[currentValueIndex] ?? "";
    const costBasisValue = costBasisTotalIndex >= 0 ? (fields[costBasisTotalIndex] ?? "") : "";
    const current = parseCurrency(currentValue);
    const costBasis = costBasisTotalIndex >= 0 ? parseCurrency(costBasisValue) : null;

    const isPendingActivity = symbol.trim().toUpperCase() === "PENDING ACTIVITY" || /pending activity/i.test(description);
    const isCash =
      isPendingActivity ||
      symbol.trim().length === 0 ||
      symbol.includes("**") ||
      /money market/i.test(description) ||
      /cash/i.test(description);

    if (isCash) {
      cashCurrent += current;
      if (isPendingActivity) {
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
