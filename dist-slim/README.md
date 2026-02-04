# Polymarket BTC 15m Assistant

A real-time trading assistant for Polymarket **"Bitcoin Up or Down"** 15-minute markets. It combines technical analysis, live price feeds, and market data to generate BUY UP / BUY DOWN signals, with optional automated trading via private key wallet.

## Features

- **Live price feeds**: Polymarket WebSocket (Chainlink BTC/USD), on-chain Chainlink (Polygon), Binance spot
- **Technical analysis**: Heiken Ashi, RSI, MACD, VWAP, 1m/3m delta
- **Signal engine**: Computes model probabilities (LONG/SHORT %), edge vs market prices, and ENTER/NO_TRADE recommendations
- **Trading**: Place orders on Polymarket via CLOB API using your wallet private key
- **Clawbot integration**: AI-driven position sizing, take-profit, stop-loss, and pre-settlement sell when `CLAWBOT_MODE=true`

## Requirements

- Node.js **18+**
- npm

## Installation

```bash
git clone <repository-url>
cd PolymarketBTC15mAssistant-main
npm install
```

## Configuration

Copy the example env file and set your credentials:

```bash
# Windows
copy .env.example .env

# Linux / macOS
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `POLYMARKET_PRIVATE_KEY` | Yes (for trading) | Wallet private key (export from MetaMask or polymarket.com) |
| `POLYMARKET_FUNDER` | Yes (for trading) | Funder address from polymarket.com/settings |
| `POLYMARKET_SIGNATURE_TYPE` | No | `0`=EOA, `1`=Magic/Email, `2`=Gnosis Safe (default: 2) |
| `POLYMARKET_ORDER_SIZE` | No | Shares per order when not using Clawbot mode (default: 5) |
| `POLYMARKET_ORDER_SIZE_USD` | No | Max USD per order (overrides ORDER_SIZE) |
| `CLAWBOT_MODE` | No | `true` = AI-driven sizing + TP/SL; `false` = fixed size, no auto-sell (default) |
| `POLYMARKET_SLUG` | No | Pin a specific market slug (leave empty for auto-select) |
| `POLYGON_RPC_URL` | No | Polygon RPC for Chainlink fallback (default: polygon-rpc.com) |
| `HTTPS_PROXY` | No | HTTP(S) proxy for requests |

## Commands

### `npm start`

Runs the **live console dashboard**. Displays:

- Current Polymarket BTC 15m market
- Time left until settlement
- TA indicators (Heiken Ashi, RSI, MACD, VWAP, Delta)
- Model probabilities (LONG/SHORT %)
- Polymarket UP/DOWN prices and liquidity
- Chainlink current price vs price-to-beat
- **Signal**: BUY UP, BUY DOWN, or NO TRADE

Updates every second. Press `Ctrl+C` to stop.

---

### `npm run signal`

Fetches the current signal once and outputs JSON. Use for scripts or Clawbot.

**Output fields**:
- `action`: `ENTER` or `NO_TRADE`
- `side`: `UP` or `DOWN` (when ENTER)
- `phase`: `EARLY`, `MID`, or `LATE`
- `strength`: `STRONG`, `GOOD`, or `OPTIONAL`
- `modelUp`, `modelDown`: Model probabilities (0–1)
- `marketUp`, `marketDown`: Market prices
- `edgeUp`, `edgeDown`: Edge vs market
- `timeLeftMin`: Minutes until settlement
- `btcPrice`: Current BTC price
- `marketSnapshot`: Market metadata, token IDs, orderbook

---

### `npm run trade`

Trade CLI. Supports:

| Subcommand | Description |
|------------|-------------|
| `--signal` | Same as `npm run signal` (JSON output) |
| `--execute=UP` | Place BUY UP order (with confirmation) |
| `--execute=DOWN` | Place BUY DOWN order (with confirmation) |
| `--execute=UP --yes` | Place BUY UP without confirmation |

**Examples**:

```bash
npm run trade -- --signal
npm run trade -- --execute=UP
npm run trade -- --execute=DOWN --yes
```

**Behavior**:
- Verifies current signal is ENTER and matches requested side
- Prompts for confirmation unless `--yes`
- Uses `POLYMARKET_ORDER_SIZE` or `POLYMARKET_ORDER_SIZE_USD` for size

---

### `npm run trade:up` / `npm run trade:down`

Shortcuts for `--execute=UP` and `--execute=DOWN` (with confirmation).

---

### `npm run context`

Builds **Clawbot context** JSON. Use when `CLAWBOT_MODE=true` so the AI can decide trade parameters.

**Output**:
- `signal`: Action, side, phase, strength, edge, model/market prices
- `balance`: USDCe balance
- `riskAssessment`: Risk level (LOW/MEDIUM/HIGH) and reason
- `suggestedParams`: Suggested `sizeUsd`, `takeProfitPct`, `stopLossPct`, `preSettlementMin`
- `marketSnapshot`: Market data for order placement

---

### `npm run clawbot-execute`

Executes a trade with **Clawbot-provided parameters**. Requires `CLAWBOT_MODE=true`.

**Input** (stdin or `--params=`):

```json
{
  "side": "UP",
  "sizeUsd": 10,
  "takeProfitPct": 20,
  "stopLossPct": 12,
  "preSettlementMin": 3
}
```

**Examples**:

```bash
echo '{"side":"UP","sizeUsd":10,"takeProfitPct":20,"stopLossPct":12,"preSettlementMin":3}' | npm run clawbot-execute
npm run clawbot-execute -- --params='{"side":"DOWN","sizeUsd":5}'
```

**Behavior**:
- Verifies signal matches requested side
- Places order with given `sizeUsd`
- Saves position for TP/SL tracking
- Starts position monitor in background

---

### `npm run monitor`

Runs the **position monitor** daemon. Checks open positions every 5 seconds and:

- **Take-profit**: Sells when profit reaches `takeProfitPct`
- **Stop-loss**: Sells when loss reaches `stopLossPct`
- **Pre-settlement**: Sells when time left ≤ `preSettlementMin`

Runs until `Ctrl+C`. Requires `CLAWBOT_MODE=true` and positions created via `clawbot-execute`.

---

## How It Works

### Signal Logic

1. **Data**: Fetches 1m/5m candles from Binance, Chainlink BTC/USD (Polymarket WS or Polygon), and Polymarket market snapshot.
2. **Indicators**: Computes VWAP, RSI, MACD, Heiken Ashi, 1m/3m delta.
3. **Scoring**: Combines indicators into LONG/SHORT probabilities with time-aware adjustment.
4. **Edge**: Compares model probabilities to Polymarket prices.
5. **Decision**: ENTER when edge exceeds phase-dependent threshold and model probability is high enough.

### Trading Modes

| Mode | Toggle | Size | Take-profit | Stop-loss | Pre-settlement |
|------|--------|------|-------------|-----------|----------------|
| **Fixed** | `CLAWBOT_MODE=false` | `POLYMARKET_ORDER_SIZE` or `ORDER_SIZE_USD` | No | No | No |
| **Clawbot** | `CLAWBOT_MODE=true` | AI-chosen via `context` + `clawbot-execute` | Yes | Yes | Yes |

### Clawbot Flow

1. Run `npm run context` → AI receives signal, balance, risk, suggested params.
2. AI returns params (or uses suggested): `side`, `sizeUsd`, `takeProfitPct`, `stopLossPct`, `preSettlementMin`.
3. Run `clawbot-execute` with those params → order placed, position stored.
4. Run `npm run monitor` → monitors positions and sells on TP/SL/pre-settlement.

---

## Proxy Support

Set standard env vars:

- `HTTPS_PROXY` / `https_proxy`
- `HTTP_PROXY` / `http_proxy`
- `ALL_PROXY` / `all_proxy`

Example:

```bash
export HTTPS_PROXY=http://127.0.0.1:8080
```

---

## Logs

- `./logs/signals.csv` — Signal history (timestamp, regime, signal, model/market prices, recommendation)
- `./logs/positions.json` — Open positions for TP/SL (Clawbot mode)

---
