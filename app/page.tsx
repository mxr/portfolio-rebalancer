"use client";

import { Suspense, useMemo, useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  arraysEqual,
  computeSortOrder,
  computeTotals,
  computeTradeSummary,
  createRow,
  DEFAULT_ROWS,
  formatCurrency,
  formatPercent,
  getNextRowIndex,
  makeRowId,
  normalizeRows,
  parseFidelityCsv,
  parseRows,
  serializeRows,
  toNumber,
  type Row,
  type SortKey,
  type SortState,
} from "../lib/rebalancer";

const parseSortState = (value: string | null): SortState | null => {
  if (!value) {
    return null;
  }
  const [key, direction] = value.split(":");
  if (
    (key === "ticker" ||
      key === "current" ||
      key === "target" ||
      key === "amount") &&
    (direction === "asc" || direction === "desc")
  ) {
    return { key, direction };
  }
  return null;
};


function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialRows = normalizeRows(parseRows(searchParams.get("rows")));
  const initialSort = parseSortState(searchParams.get("sort"));
  const [rows, setRows] = useState<Row[]>(() =>
    normalizeRows(initialRows ?? DEFAULT_ROWS),
  );
  const nextRowIndex = useRef(getNextRowIndex(rows));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sortState, setSortState] = useState<SortState>(
    initialSort ?? { key: "ticker", direction: "asc" },
  );
  const [sortOrder, setSortOrder] = useState<string[] | null>(null);

  const getSortIndicator = (key: SortKey) =>
    sortState.key !== key
      ? "↕"
      : sortState.direction === "asc"
        ? "▲"
        : "▼";

  const updateSort = (key: SortKey) => {
    setSortState(function applySort(prev) {
      const direction =
        prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      setSortOrder(computeSortOrder(rows, totals, key, direction));
      return { key, direction };
    });
  };

  const totals = useMemo(() => computeTotals(rows), [rows]);

  const sortedRows = useMemo(() => {
    if (rows.length <= 1) {
      return rows;
    }

    const [cashRow, ...rest] = rows;
    if (!sortOrder) {
      return [cashRow, ...rest];
    }

    const rowMap = new Map(rest.map((row) => [row.id, row]));
    const ordered = sortOrder
      .map((id) => rowMap.get(id))
      .filter((row): row is Row => Boolean(row));
    const leftovers = rest.filter((row) => !sortOrder.includes(row.id));

    return [cashRow, ...ordered, ...leftovers];
  }, [rows, sortOrder]);

  const applySortOrderOnBlur = () => {
    if (!sortOrder) {
      return;
    }
    setSortOrder(
      computeSortOrder(rows, totals, sortState.key, sortState.direction),
    );
  };

  const tradeSummary = useMemo(
    () => computeTradeSummary(rows, totals),
    [rows, totals],
  );

  const handleRowChange = (id: string, key: keyof Row, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
  };

  const handleTabAddRow = (
    event: React.KeyboardEvent<HTMLInputElement>,
    isLastRow: boolean,
  ) => {
    if (event.key !== "Tab" || event.shiftKey || !isLastRow) {
      return;
    }

    event.preventDefault();
    const newRow = createRow(makeRowId(nextRowIndex.current));
    nextRowIndex.current += 1;
    setRows((prev) => [...prev, newRow]);
    window.setTimeout(() => {
      const nextInput = document.getElementById(`ticker-${newRow.id}`);
      if (nextInput instanceof HTMLInputElement) {
        nextInput.focus();
      }
    }, 0);
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { cashCurrent, positions } = parseFidelityCsv(text);
      setRows((prev) => {
        const targetByTicker = new Map(
          prev.slice(1).map((row) => [row.ticker.toUpperCase(), row.target]),
        );
        const nextRows: Row[] = [
          {
            id: makeRowId(0),
            ticker: "CASH",
            current: cashCurrent ? cashCurrent.toFixed(2) : "",
            target: "",
          },
        ];

        positions.forEach((position, index) => {
          nextRows.push({
            id: makeRowId(index + 1),
            ticker: position.ticker,
            current: position.current ? position.current.toFixed(2) : "",
            target: targetByTicker.get(position.ticker) ?? "",
          });
        });

        nextRowIndex.current = nextRows.length;
        return normalizeRows(nextRows);
      });
    };

    reader.readAsText(file);
    event.target.value = "";
  };

  useEffect(function normalizeInitialRows() {
    setRows((prev) => normalizeRows(prev));
  }, []);

  useEffect(function applyInitialSortFromUrl() {
    if (!sortOrder && initialSort) {
      setSortOrder(
        computeSortOrder(rows, totals, initialSort.key, initialSort.direction),
      );
    }
  }, [initialSort, sortOrder, rows, totals]);

  useEffect(function syncSortOrderWithRows() {
    if (!sortOrder) {
      return;
    }
    setSortOrder(function syncOrder(prev) {
      if (!prev) {
        return prev;
      }
      const ids = new Set(rows.slice(1).map((row) => row.id));
      const nextOrder = prev.filter((id) => ids.has(id));
      rows.slice(1).forEach((row) => {
        if (!nextOrder.includes(row.id)) {
          nextOrder.push(row.id);
        }
      });
      return arraysEqual(prev, nextOrder) ? prev : nextOrder;
    });
  }, [rows, sortOrder]);

  useEffect(function syncUrlState() {
    const encodedRows = serializeRows(rows, totals.cashTarget);
    const sortValue = sortOrder
      ? `${sortState.key}:${sortState.direction}`
      : "";
    const nextParams = new URLSearchParams(searchParams);
    if (encodedRows) {
      nextParams.set("rows", encodedRows);
    } else {
      nextParams.delete("rows");
    }
    if (sortOrder) {
      nextParams.set("sort", sortValue);
    } else {
      nextParams.delete("sort");
    }

    const currentEncoded = searchParams.get("rows") ?? "";
    const currentSort = searchParams.get("sort") ?? "";
    if (currentEncoded !== encodedRows || currentSort !== sortValue) {
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  }, [pathname, router, rows, searchParams, sortOrder, sortState, totals]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f1e8]">
      <div className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-[#f0c9a7]/60 blur-3xl animate-[float-soft_14s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute -right-20 top-24 h-80 w-80 rounded-full bg-[#b6d6cf]/60 blur-3xl animate-[float-soft_16s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#edb3b9]/40 blur-3xl animate-[float-soft_18s_ease-in-out_infinite]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3 text-sm uppercase tracking-[0.3em] text-[#7b6a5b]">
            Zero-Cash Portfolio Rebalancer
          </div>
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold tracking-tight text-[#161515] sm:text-5xl">
              Rebalance your portfolio.
            </h1>
            <p className="max-w-2xl text-base text-[#4a4037] sm:text-lg">
              Enter tickers, amounts, and target allocation percentages. The
              calculator updates instantly with how much to sell or buy per
              holding to reach the target allocation. It can also read a .csv of your Positions downloaded from Fidelity
              instead (this tool is not affiliated with Fidelity in any way). Everything runs locally
              in your browser - data never leaves your machine.
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-[#e7d7c8] bg-white/80 p-6 shadow-[0_20px_60px_rgba(120,96,77,0.12)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[#181716]">
                Allocation Inputs
              </h2>
              <p className="text-sm text-[#5b5148]">
                Add a row for each ticker. Press "Add Row" (or Tab) to add more entries or the Trash icon to delete them.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-[#1b1a17] px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(30,27,23,0.2)] transition hover:-translate-y-0.5 hover:bg-[#2d2a25]"
              >
                Process CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  const newRow = createRow(makeRowId(nextRowIndex.current));
                  nextRowIndex.current += 1;
                  setRows((prev) => [...prev, newRow]);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#1b1a17] px-5 py-2 text-sm font-semibold text-[#1b1a17] transition hover:-translate-y-0.5 hover:bg-[#f1e7db]"
              >
                Add row
              </button>
            </div>
          </div>

          <div className="mt-6">
            <div className="hidden items-center gap-4 border-b border-[#f2e8dd] pb-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#8c7b6c] sm:grid sm:grid-cols-5">
              <button
                type="button"
                onClick={() => updateSort("ticker")}
                className="flex items-center gap-2"
              >
                Ticker
                <span className="text-[10px]">
                  {getSortIndicator("ticker")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => updateSort("current")}
                className="flex items-center gap-2"
              >
                Current
                <span className="text-[10px]">
                  {getSortIndicator("current")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => updateSort("target")}
                className="flex items-center gap-2"
              >
                Target
                <span className="text-[10px]">
                  {getSortIndicator("target")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => updateSort("amount")}
                className="flex items-center gap-2"
              >
                Trade
                <span className="text-[10px]">
                  {getSortIndicator("amount")}
                </span>
              </button>
              <span className="text-right">Action</span>
            </div>

            <div className="mt-2 flex flex-col gap-0">
              {sortedRows.map((row, index) => {
                const isCash = row.ticker.toUpperCase() === "CASH";
                const isLastRow = index === sortedRows.length - 1;
                const currentValue = toNumber(row.current);
                const targetValue = isCash
                  ? totals.cashTarget
                  : toNumber(row.target);
                const desiredValue =
                  totals.totalCurrent * (targetValue / 100);
                const delta = desiredValue - currentValue;
                const actionLabel =
                  delta >= 0 ? "Buy" : "Sell";

                return (
                  <div
                    key={row.id}
                    className={`grid gap-2 border-b border-[#f2e8dd] px-2 py-3 sm:grid-cols-5 last:border-b-0 ${
                      isCash ? "bg-[#fbf6ef]/70" : "bg-transparent"
                    }`}
                  >
                    <input
                      id={`ticker-${row.id}`}
                      value={row.ticker}
                      onChange={(event) =>
                        handleRowChange(
                          row.id,
                          "ticker",
                          event.target.value.toUpperCase(),
                        )
                      }
                      onBlur={applySortOrderOnBlur}
                      readOnly={isCash}
                      placeholder="VTI"
                      className={`h-12 rounded-xl border px-3 text-sm font-medium outline-none transition focus:border-[#c9a888] focus:ring-2 focus:ring-[#edc9a6]/60 ${
                        isCash
                          ? "border-[#e6d7c7] bg-[#fff7ed] text-[#7a6757]"
                          : "border-[#e6d7c7] bg-[#fefbf7] text-[#1d1b18]"
                      }`}
                    />
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8a7768]">
                        $
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={row.current}
                        onChange={(event) =>
                          handleRowChange(row.id, "current", event.target.value)
                        }
                        onKeyDown={(event) =>
                          handleTabAddRow(event, isLastRow && isCash)
                        }
                        onBlur={applySortOrderOnBlur}
                        placeholder="0.00"
                        className={`h-12 w-full appearance-none rounded-xl border pl-7 pr-3 text-sm font-medium outline-none transition focus:border-[#c9a888] focus:ring-2 focus:ring-[#edc9a6]/60 ${
                          isCash
                            ? "border-[#e6d7c7] bg-[#fff7ed] text-[#1d1b18]"
                            : "border-[#e6d7c7] bg-[#fefbf7] text-[#1d1b18]"
                        }`}
                      />
                    </div>
                    {isCash ? (
                      <div className="relative">
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8a7768]">
                          %
                        </span>
                        <div className="flex h-12 items-center rounded-xl border border-[#e6d7c7] bg-[#fff7ed] px-3 pr-8 text-sm font-medium text-[#7a6757]">
                          {formatPercent(totals.cashTarget)}
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8a7768]">
                          %
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={row.target}
                          onChange={(event) =>
                            handleRowChange(
                              row.id,
                              "target",
                              event.target.value,
                            )
                          }
                          onKeyDown={(event) =>
                            handleTabAddRow(event, isLastRow)
                          }
                          onBlur={applySortOrderOnBlur}
                          placeholder="0"
                          className="h-12 w-full appearance-none rounded-xl border border-[#e6d7c7] bg-[#fefbf7] px-3 pr-8 text-sm font-medium text-[#1d1b18] outline-none transition focus:border-[#c9a888] focus:ring-2 focus:ring-[#edc9a6]/60"
                        />
                      </div>
                    )}
                    <div
                      className={`flex h-12 items-center gap-2 rounded-xl border border-dashed px-3 text-base font-semibold ${
                        isCash
                          ? "border-[#e7d8c7] bg-[#fff7ed] text-[#4a4037]"
                          : "border-[#d6c5b3] bg-[#fbf6ef] text-[#2b241f]"
                      }`}
                    >
                      <span className="text-xs uppercase tracking-[0.2em] text-[#7a6757]">
                        {actionLabel}
                      </span>
                      <span>{formatCurrency(Math.abs(delta))}</span>
                    </div>
                    <div className="flex h-12 items-center justify-end">
                      {isCash ? (
                        <span className="text-xs uppercase tracking-[0.2em] text-[#b39d8a]">
                          Zero out
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) =>
                              prev.length > 1
                                ? prev.filter((item) => item.id !== row.id)
                                : prev,
                            )
                          }
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#f0c8c6] text-[#c0443c] transition hover:border-[#e9a8a4] hover:text-[#a73730]"
                          aria-label="Delete row"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path
                              d="M4 6H20L18.4199 20.2209C18.3074 21.2337 17.4512 22 16.4321 22H7.56786C6.54876 22 5.69264 21.2337 5.5801 20.2209L4 6Z"
                            />
                            <path
                              d="M7.34491 3.14716C7.67506 2.44685 8.37973 2 9.15396 2H14.846C15.6203 2 16.3249 2.44685 16.6551 3.14716L18 6H6L7.34491 3.14716Z"
                            />
                            <path d="M2 6H22" />
                            <path d="M10 11V16" />
                            <path d="M14 11V16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </section>

        <section className="rounded-3xl border border-[#e7d7c8] bg-white/80 p-6 shadow-[0_20px_60px_rgba(120,96,77,0.12)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[#181716]">
                Trade Summary
              </h2>
              <p className="text-sm text-[#5b5148]">
                Suggested trades based on your target allocations.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[#f2e8dd] bg-[#fff8ef] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-[#8a7768]">
                Sell
              </p>
              {tradeSummary.sells.length === 0 ? (
                <p className="mt-3 text-sm text-[#7a6a5d]">
                  Nothing to sell.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {tradeSummary.sells.map((item) => (
                    <div
                      key={`sell-${item.ticker}`}
                      className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-sm text-[#3f372f]"
                    >
                      <span className="font-semibold">{item.ticker}</span>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#f2e8dd] bg-[#f3f7f3] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-[#7b8a76]">
                Buy
              </p>
              {tradeSummary.buys.length === 0 ? (
                <p className="mt-3 text-sm text-[#6c7a66]">
                  Nothing to buy.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {tradeSummary.buys.map((item) => (
                    <div
                      key={`buy-${item.ticker}`}
                      className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-sm text-[#2f3a30]"
                    >
                      <span className="font-semibold">{item.ticker}</span>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[#5b5148]">Loading…</div>}>
      <HomeContent />
    </Suspense>
  );
}
