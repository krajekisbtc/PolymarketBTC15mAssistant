/**
 * Polymarket CLOB trading module.
 * Uses private key wallet for order placement.
 *
 * Env vars:
 *   POLYMARKET_PRIVATE_KEY - Wallet private key (required)
 *   POLYMARKET_FUNDER - Funder address (proxy wallet from polymarket.com/settings, or EOA address)
 *   POLYMARKET_SIGNATURE_TYPE - 0=EOA, 1=Magic/Email, 2=Gnosis Safe (default: 2 for Polymarket.com)
 *   POLYMARKET_ORDER_SIZE - Default order size in shares (default: 5)
 *   POLYMARKET_ORDER_SIZE_USD - Max USD per order (optional, overrides size)
 */

import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client";
import { Wallet } from "ethers";

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137; // Polygon
const COLLATERAL_DECIMALS = 6;

function getConfig() {
  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  const funder = process.env.POLYMARKET_FUNDER;
  const sigType = parseInt(process.env.POLYMARKET_SIGNATURE_TYPE ?? "2", 10);
  const orderSize = parseInt(process.env.POLYMARKET_ORDER_SIZE ?? "5", 10);
  const orderSizeUsd = process.env.POLYMARKET_ORDER_SIZE_USD
    ? parseFloat(process.env.POLYMARKET_ORDER_SIZE_USD)
    : null;

  if (!pk || !funder) {
    throw new Error(
      "POLYMARKET_PRIVATE_KEY and POLYMARKET_FUNDER must be set. " +
        "Get funder from polymarket.com/settings (profile dropdown)."
    );
  }

  return { pk, funder, sigType, orderSize, orderSizeUsd };
}

let _client = null;
let _creds = null;

async function getClient() {
  if (_client) return _client;

  const { pk, funder, sigType } = getConfig();
  const signer = new Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);

  const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
  _creds = await tempClient.createOrDeriveApiKey();
  _client = new ClobClient(HOST, CHAIN_ID, signer, _creds, sigType, funder);

  return _client;
}

/**
 * Place a BUY order on Polymarket BTC 15m market.
 * @param {Object} params
 * @param {string} params.tokenId - CLOB token ID (Up or Down outcome)
 * @param {number} params.price - Price per share (0.01-0.99)
 * @param {number} [params.size] - Number of shares (default from env)
 * @param {string} [params.tickSize] - Market tick size (default "0.01")
 * @param {boolean} [params.negRisk] - Negative risk market (default false for binary)
 */
export async function placeOrder({ tokenId, price, size, tickSize = "0.01", negRisk = false }) {
  const { orderSize, orderSizeUsd } = getConfig();
  let orderSizeFinal = size;

  if (orderSizeFinal == null) {
    orderSizeFinal = orderSize;
    if (orderSizeUsd != null && Number.isFinite(orderSizeUsd) && price > 0) {
      orderSizeFinal = Math.floor(orderSizeUsd / price);
      if (orderSizeFinal < 1) orderSizeFinal = 1;
    }
  }
  orderSizeFinal = Math.max(1, Math.floor(orderSizeFinal));

  const client = await getClient();

  const market = await client.getMarket(tokenId);
  const marketTickSize = market?.tickSize ?? tickSize;
  const marketNegRisk = market?.negRisk ?? negRisk;

  const response = await client.createAndPostOrder(
    {
      tokenID: tokenId,
      price: Number(price),
      size: orderSizeFinal,
      side: Side.BUY
    },
    { tickSize: marketTickSize, negRisk: marketNegRisk },
    OrderType.GTC
  );

  return response;
}

/**
 * Place BUY UP or BUY DOWN on current BTC 15m market.
 * @param {Object} params
 * @param {"UP"|"DOWN"} params.side - Which outcome to buy
 * @param {Object} params.marketSnapshot - From fetchPolymarketSnapshot()
 * @param {number} [params.price] - Limit price (default: best ask or 0.50)
 * @param {number} [params.size] - Override size in shares (Clawbot mode)
 * @param {number} [params.sizeUsd] - Override size in USD (Clawbot mode)
 */
export async function placeBtc15mOrder({ side, marketSnapshot, price, size, sizeUsd }) {
  if (!marketSnapshot?.tokens) {
    throw new Error("Invalid market snapshot");
  }
  const snap = marketSnapshot;

  const tokenId = side === "UP" ? snap.tokens?.upTokenId : snap.tokens?.downTokenId;
  if (!tokenId) throw new Error(`Missing token for side ${side}`);

  let orderPrice = price;
  if (orderPrice == null) {
    const book = side === "UP" ? snap.orderbook?.up : snap.orderbook?.down;
    orderPrice = book?.bestAsk ?? 0.5;
    if (orderPrice <= 0 || orderPrice >= 1) orderPrice = 0.5;
  }

  let orderSize = size;
  if (sizeUsd != null && orderPrice > 0) {
    orderSize = Math.floor(sizeUsd / orderPrice);
  }
  return placeOrder({ tokenId, price: orderPrice, size: orderSize });
}

/**
 * Get USDCe balance in USD.
 */
export async function getBalanceUsd() {
  const client = await getClient();
  const res = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  const raw = res?.balance ?? "0";
  return Number(raw) / 10 ** COLLATERAL_DECIMALS;
}

/**
 * Place a SELL order (close position).
 */
export async function sellOrder({ tokenId, price, size, tickSize = "0.01", negRisk = false }) {
  const client = await getClient();
  const market = await client.getMarket(tokenId);
  const marketTickSize = market?.tickSize ?? tickSize;
  const marketNegRisk = market?.negRisk ?? negRisk;

  const response = await client.createAndPostOrder(
    {
      tokenID: tokenId,
      price: Number(price),
      size: Number(size),
      side: Side.SELL
    },
    { tickSize: marketTickSize, negRisk: marketNegRisk },
    OrderType.GTC
  );
  return response;
}

/**
 * Cancel an order by ID.
 */
export async function cancelOrder(orderId) {
  const client = await getClient();
  return client.cancelOrder(orderId);
}

/**
 * Get open orders.
 */
export async function getOpenOrders() {
  const client = await getClient();
  return client.getOpenOrders();
}
