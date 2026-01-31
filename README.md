# Nextjs Portfolio Rebalancer

Frontend-only portfolio rebalancing tool built with Next.js. Enter tickers, current dollar amounts, and target allocations to see buy/sell guidance. Optionally import a Fidelity CSV to populate current values.

## Features
- Dynamic rows with cash allocation auto-balancing to 100%
- Trade summary (buy/sell amounts)
- URL persistence for rows and sort state
- Fidelity CSV import (client-side only)
- Unit tests + coverage

## Getting started
```bash
npm install
npm run dev
```

## Tests
```bash
npm run test
npm run test:coverage
```

## Build
```bash
npm run build
```

## Notes
- All calculations run locally in the browser.
- Node version: ^22 (see `package.json`).

## TODO
- Add validation + inline warnings (targets >100%, negative amounts, missing tickers)
- CSV import feedback (success/error toast + parsed row count)
- “Reset” and “Clear all” actions
- Optional “Buy/Sell net to cash” summary line
- A11y pass (focus states, labels for inputs, keyboard shortcuts)
- “Export URL” button
