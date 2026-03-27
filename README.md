# Portfolio Rebalancer

Frontend-only portfolio rebalancing tool built with Next.js. Enter tickers, current dollar amounts, and target allocations to see buy/sell guidance. Optionally import a Fidelity CSV to populate current values.

## Live app
- https://portfolio-rebalancer-five-woad-14.vercel.app

## Features
- Dynamic rows with cash allocation auto-balancing to 100%
- Trade summary (buy/sell amounts)
- URL persistence for rows and sort state
- Fidelity CSV import (client-side only)
- Unit tests + coverage

## Getting started
```sh
npm install
npm run dev
```

## Tests
```sh
npm run test
npm run test:coverage
```

## Build
```sh
npm run build
```

## Notes
- All calculations run locally in the browser.

## TODO
- Add validation + inline warnings (targets >100%, negative amounts, missing tickers)
- CSV import feedback (success/error toast + parsed row count)
- “Reset” and “Clear all” actions
- Optional “Buy/Sell net to cash” summary line
- A11y pass (focus states, labels for inputs, keyboard shortcuts)
- “Export URL” button
