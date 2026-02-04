import WebSocket from "ws";
import { ethers } from "ethers";
import { CONFIG } from "../config.js";
import { wsAgentForUrl } from "../net/proxy.js";

const ANSWER_UPDATED_TOPIC0 = ethers.utils.id("AnswerUpdated(int256,uint256,uint256)");

function getWssCandidates() {
  const fromList = Array.isArray(CONFIG.chainlink.polygonWssUrls) ? CONFIG.chainlink.polygonWssUrls : [];
  const single = CONFIG.chainlink.polygonWssUrl ? [CONFIG.chainlink.polygonWssUrl] : [];
  const all = [...fromList, ...single].map((s) => String(s).trim()).filter(Boolean);
  return Array.from(new Set(all));
}

function hexToSignedBigInt(hex) {
  const bn = ethers.BigNumber.from(hex);
  const TWO_255 = ethers.BigNumber.from(2).pow(255);
  const TWO_256 = ethers.BigNumber.from(2).pow(256);
  return bn.gte(TWO_255) ? bn.sub(TWO_256) : bn;
}

function toNumber(x) {
  if (x == null) return null;
  const n = x && typeof x.toNumber === "function" ? x.toNumber() : Number(x);
  return Number.isFinite(n) ? n : null;
}

export function startChainlinkPriceStream({
  aggregator = CONFIG.chainlink.btcUsdAggregator,
  decimals = 8,
  onUpdate
} = {}) {
  const wssUrls = getWssCandidates();
  if (!aggregator || wssUrls.length === 0) {
    return {
      getLast() {
        return { price: null, updatedAt: null, source: "chainlink_ws" };
      },
      close() {}
    };
  }

  let ws = null;
  let closed = false;
  let reconnectMs = 500;
  let urlIndex = 0;

  let lastPrice = null;
  let lastUpdatedAt = null;

  let nextId = 1;
  let subId = null;

  const connect = () => {
    if (closed) return;

    const url = wssUrls[urlIndex % wssUrls.length];
    urlIndex += 1;

    ws = new WebSocket(url, { agent: wsAgentForUrl(url) });

    const send = (obj) => {
      try {
        ws?.send(JSON.stringify(obj));
      } catch {
        // ignore
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      try {
        ws?.terminate();
      } catch {
        // ignore
      }
      ws = null;
      subId = null;
      const wait = reconnectMs;
      reconnectMs = Math.min(10_000, Math.floor(reconnectMs * 1.5));
      setTimeout(connect, wait);
    };

    ws.on("open", () => {
      reconnectMs = 500;
      const id = nextId++;
      send({
        jsonrpc: "2.0",
        id,
        method: "eth_subscribe",
        params: [
          "logs",
          {
            address: aggregator,
            topics: [ANSWER_UPDATED_TOPIC0]
          }
        ]
      });
    });

    ws.on("message", (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }

      if (msg.id && msg.result && typeof msg.result === "string" && !subId) {
        subId = msg.result;
        return;
      }

      if (msg.method !== "eth_subscription") return;
      const params = msg.params;
      if (!params || !params.result) return;

      const log = params.result;
      const topics = Array.isArray(log.topics) ? log.topics : [];
      if (topics.length < 2) return;

      try {
        const answer = hexToSignedBigInt(topics[1]);
        const price = toNumber(answer) / 10 ** Number(decimals);
        const updatedAtHex = typeof log.data === "string" ? log.data : null;
        const updatedAt = updatedAtHex ? toNumber(ethers.BigNumber.from(updatedAtHex)) : null;

        lastPrice = Number.isFinite(price) ? price : lastPrice;
        lastUpdatedAt = updatedAt ? updatedAt * 1000 : lastUpdatedAt;

        if (typeof onUpdate === "function") {
          onUpdate({ price: lastPrice, updatedAt: lastUpdatedAt, source: "chainlink_ws" });
        }
      } catch {
        return;
      }
    });

    ws.on("close", scheduleReconnect);
    ws.on("error", scheduleReconnect);
  };

  connect();

  return {
    getLast() {
      return { price: lastPrice, updatedAt: lastUpdatedAt, source: "chainlink_ws" };
    },
    close() {
      closed = true;
      try {
        if (ws && subId) {
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "eth_unsubscribe", params: [subId] }));
        }
      } catch {
        // ignore
      }
      try {
        ws?.close();
      } catch {
        // ignore
      }
      ws = null;
      subId = null;
    }
  };
}
