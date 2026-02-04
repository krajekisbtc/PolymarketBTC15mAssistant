---
name: polymarket-btc15m
description: Trade Polymarket Bitcoin Up/Down 15-minute markets using TA signals. Supports Clawbot mode (dynamic sizing, TP/SL, pre-settlement) or fixed mode. Use when checking signals, placing trades, or automating via private key.
---

# Polymarket BTC 15m Trading Skill

Clawbot manages Polymarket BTC 15m trades using signals from PolymarketBTC15mAssistant.

## Modes

| Mode | Toggle | Position size | Take-profit | Stop-loss | Pre-settlement sell |
|------|--------|---------------|-------------|-----------|----------------------|
| **Clawbot** | `CLAWBOT_MODE=true` | Dynamic from balance & risk | Yes | Yes | Yes |
| **Fixed** | `CLAWBOT_MODE=false` (default) | Fixed (ORDER_SIZE) | No | No | No |

### Clawbot mode logic

- **High risk** (late phase, low edge): small % of balance (2–3%), tighter SL
- **Strong signal** (STRONG, high edge): larger % (up to 15%), wider TP
- **Reserve**: always keeps 20% of balance
- **Max per trade**: never more than 30% of balance

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POLYMARKET_PRIVATE_KEY` | Yes (trading) | Wallet private key |
| `POLYMARKET_FUNDER` | Yes (trading) | Funder from polymarket.com/settings |
| `CLAWBOT_MODE` | No | `true` or `false` (default) |
| `POLYMARKET_ORDER_SIZE` | No | Shares when Clawbot OFF (default: 5) |
| `POLYMARKET_SIGNATURE_TYPE` | No | 0/1/2 (default: 2) |

## Commands

### Get signal

```bash
npm run signal
```

With `CLAWBOT_MODE=true`, output includes `clawbotParams` (balance, size, TP%, SL%, sellBeforeMin).

### Execute trade

```bash
npm run trade:up
npm run trade:down
node src/trade-cli.js --execute=UP --yes
```

### Position monitor (Clawbot mode only)

One cycle:

```bash
node src/trade-cli.js --monitor
```

Background daemon (runs until Ctrl+C):

```bash
npm run monitor
```

## Workflow for Clawbot

1. **"What's the signal?"**
   - Run `npm run signal`
   - Summarize: action, side, phase, strength, model probs, time left
   - If Clawbot mode: include clawbotParams (balance, suggested size, TP/SL)

2. **"Place trade for UP"**
   - Run `npm run signal` → verify ENTER + side UP
   - If match: `npm run trade:up` (or `--execute=UP --yes` if approved)
   - If mismatch: abort and explain

3. **"Enable/disable Clawbot mode"**
   - Set `CLAWBOT_MODE=true` or `false` in .env
   - Explain: Clawbot = dynamic sizing + auto TP/SL; Fixed = manual only

4. **"Run monitor"** (when Clawbot mode + open positions)
   - Run `npm run monitor` in background, or `node src/trade-cli.js --monitor` for one cycle

## Safety

- No system guarantees profits. Clawbot improves edge but does not eliminate risk.
- Prefer user confirmation for trades unless automation is explicitly approved.
- Never log or expose `POLYMARKET_PRIVATE_KEY`.

## Installation

```bash
cp -r clawbot-skill ~/.clawbot/skills/polymarket-btc15m
# or
ln -s /path/to/PolymarketBTC15mAssistant-main ~/.clawbot/skills/polymarket-btc15m
```

Ensure execution engine allows `npm` and `node` from the project directory.
