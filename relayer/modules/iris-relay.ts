/**
 * Iris Attestation Relay Module
 *
 * Handles CCTP message relay using Circle's real attestation service (Iris).
 * Replaces the mock relay for testnet/mainnet deployments.
 *
 * Flow:
 *   1. Watch for MessageSent(bytes message) events from real MessageTransmitterV2
 *   2. Queue new messages as "pending" with their source tx hash
 *   3. Each poll cycle, check Iris for attestations on all pending messages
 *   4. When attestation is ready, call receiveMessage(message, attestation) on destination
 *
 * Non-blocking design: attestation polling never stalls the event scanner.
 * Messages stay queued until attested or expired (configurable, default 30 min).
 *
 * Circle Iris API:
 *   Testnet: https://iris-api-sandbox.circle.com
 *   Mainnet: https://iris-api.circle.com
 */

import { ethers } from "ethers";
import {
  allChains,
  accounts,
  armadaRelayerSettings,
  type ChainConfig,
} from "../config";
import * as fs from "fs";
import * as path from "path";
import { CursorStore } from "../lib/cursor-store";
import { getLogsChunked } from "../lib/get-logs-chunked";
import { RpcTimeoutError, withTimeout } from "../lib/rpc-utils";

/** Where per-chain cursor files live. Module-relative so the relayer is location-independent. */
const RELAYER_STATE_DIR = path.join(__dirname, "..", "state");

// ============ Types ============

interface PendingMessage {
  /** Raw message bytes from MessageSent event */
  messageBytes: string;
  /** keccak256 hash of the message bytes */
  messageHash: string;
  /** Source chain CCTP domain */
  sourceDomain: number;
  /** Destination chain CCTP domain */
  destinationDomain: number;
  /** Full bytes32 nonce from message header */
  nonce: string;
  /** Source transaction hash */
  sourceTxHash: string;
  /** Block number of source event */
  sourceBlock: number;
  /** When we first detected this message */
  detectedAt: number;
  /** Number of Iris poll attempts */
  pollAttempts: number;
  /** Last Iris status seen */
  lastStatus: string;
}

interface IrisMessageResponse {
  messages: Array<{
    attestation: string;
    message: string;
    eventNonce: string;
    status: "pending" | "pending_confirmations" | "complete";
  }>;
}

interface ChainState {
  config: ChainConfig;
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
  messageTransmitter: string;
  hookRouter: string | null;
  /** Known contract addresses that can receive CCTP messages on this chain (lowercase, zero-padded bytes32) */
  knownRecipients: Set<string>;
  domain: number;
  /**
   * Highest block we have FULLY scanned (inclusive). Loaded from disk on cold start; advanced
   * after every successful chunk via the cursor store. Restart-safe: a kill -9 mid-poll loses
   * at most one chunk of replay, never the entire scan window.
   */
  lastProcessedBlock: number;
  /** Set of canonical message hashes we've enqueued. In-memory only — dedup across restarts comes from the contract's "already processed" check. */
  processedMessages: Set<string>;
  /**
   * Last scan error for this chain, or null when the most recent tick succeeded. Surfaces in
   * future health endpoint + immediately makes "scanner stuck" visible to operators. Replaces
   * the silent catch that hid the original Sepolia incident.
   */
  lastError: { message: string; at: number } | null;
  /** Unix ms of the last successful scan tick. Used by the future health endpoint. */
  lastScanAt: number;
}

// ============ Constants ============

/**
 * Real CCTP V2 MessageTransmitterV2 emits:
 *   event MessageSent(bytes message)
 *
 * This is different from our mock which has indexed fields.
 */
const REAL_MESSAGE_SENT_ABI = [
  "event MessageSent(bytes message)",
];

const REAL_MESSAGE_TRANSMITTER_ABI = [
  "function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool)",
  "function localDomain() view returns (uint32)",
];

const HOOK_ROUTER_ABI = [
  "function relayWithHook(bytes calldata message, bytes calldata attestation) external returns (bool)",
];

/**
 * Real CCTP V2 MessageV2 byte layout offsets.
 *
 * | Field                     | Bytes | Offset |
 * |---------------------------|-------|--------|
 * | version                   | 4     | 0      |
 * | sourceDomain              | 4     | 4      |
 * | destinationDomain         | 4     | 8      |
 * | nonce                     | 32    | 12     |  <-- bytes32, NOT uint64
 * | sender                    | 32    | 44     |
 * | recipient                 | 32    | 76     |
 * | destinationCaller         | 32    | 108    |
 * | minFinalityThreshold      | 4     | 140    |
 * | finalityThresholdExecuted | 4     | 144    |
 * | messageBody               | var   | 148    |
 */
const MSG_SOURCE_DOMAIN_OFFSET = 4;
const MSG_DEST_DOMAIN_OFFSET = 8;
const MSG_NONCE_OFFSET = 12;
const MSG_NONCE_LENGTH = 32; // bytes32 in real CCTP V2 (NOT 8-byte uint64)
const MSG_DEST_CALLER_OFFSET = 108;
const MSG_DEST_CALLER_LENGTH = 32;

/**
 * BurnMessageV2 mintRecipient offset within the full MessageV2.
 *
 * In real CCTP V2, the MessageV2 `recipient` field (offset 76) is always the destination
 * TokenMessenger — NOT the final recipient contract. The actual recipient (our PrivacyPool
 * or PrivacyPoolClient) is in the BurnMessageV2 body's `mintRecipient` field:
 *   - BurnMessageV2 starts at MessageV2 offset 148 (messageBody)
 *   - mintRecipient is at BurnMessageV2 offset 36 (after version(4) + burnToken(32))
 *   - Absolute offset in full message: 148 + 36 = 184
 */
const MSG_BODY_OFFSET = 148;
const BURN_MSG_MINT_RECIPIENT_OFFSET = 36;
const MINT_RECIPIENT_ABSOLUTE_OFFSET = MSG_BODY_OFFSET + BURN_MSG_MINT_RECIPIENT_OFFSET;
const MINT_RECIPIENT_LENGTH = 32;

/** Max time to keep polling for an attestation before giving up (ms) */
const MAX_ATTESTATION_AGE_MS = 30 * 60 * 1000; // 30 minutes

// ============ Helpers ============

function loadDeployment(filename: string): any | null {
  const deploymentsDir = path.join(__dirname, "../../deployments");
  const filePath = path.join(deploymentsDir, filename);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function parseMessageFields(messageHex: string): {
  sourceDomain: number;
  destinationDomain: number;
  nonce: string; // full bytes32 hex (may be zero in event — Iris fills in real nonce)
  mintRecipient: string; // bytes32 hex (lowercase) — from BurnMessageV2 body
  destinationCaller: string; // bytes32 hex (lowercase)
} {
  // Remove 0x prefix
  const hex = messageHex.startsWith("0x") ? messageHex.slice(2) : messageHex;

  const sourceDomain = parseInt(hex.slice(MSG_SOURCE_DOMAIN_OFFSET * 2, (MSG_SOURCE_DOMAIN_OFFSET + 4) * 2), 16);
  const destinationDomain = parseInt(hex.slice(MSG_DEST_DOMAIN_OFFSET * 2, (MSG_DEST_DOMAIN_OFFSET + 4) * 2), 16);
  // In real CCTP V2, the nonce in the MessageSent event is a placeholder (zero).
  // Iris assigns the real nonce and returns it in the corrected message.
  const nonce = "0x" + hex.slice(MSG_NONCE_OFFSET * 2, (MSG_NONCE_OFFSET + MSG_NONCE_LENGTH) * 2);
  const destinationCaller = "0x" + hex.slice(MSG_DEST_CALLER_OFFSET * 2, (MSG_DEST_CALLER_OFFSET + MSG_DEST_CALLER_LENGTH) * 2).toLowerCase();

  // Parse mintRecipient from BurnMessageV2 body (the actual destination contract).
  // MessageV2.recipient (offset 76) is always the dest TokenMessenger in real CCTP V2.
  let mintRecipient = "";
  const mintRecipientEnd = (MINT_RECIPIENT_ABSOLUTE_OFFSET + MINT_RECIPIENT_LENGTH) * 2;
  if (hex.length >= mintRecipientEnd) {
    mintRecipient = "0x" + hex.slice(MINT_RECIPIENT_ABSOLUTE_OFFSET * 2, mintRecipientEnd).toLowerCase();
  }

  return { sourceDomain, destinationDomain, nonce, mintRecipient, destinationCaller };
}

function elapsed(since: number): string {
  const seconds = Math.floor((Date.now() - since) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m${secs}s`;
}

// ============ Iris API Client ============

class IrisClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Single non-blocking check for attestation.
   * Returns attestation if ready, null if still pending or error.
   */
  async checkAttestation(
    sourceDomain: number,
    sourceTxHash: string
  ): Promise<{ attestation: string; message: string; status: string } | null> {
    const url = `${this.baseUrl}/v2/messages/${sourceDomain}?transactionHash=${sourceTxHash}`;

    try {
      const response = await fetch(url);

      if (response.status === 404) {
        return null; // Not yet indexed
      }

      if (!response.ok) {
        console.warn(`    [iris] API error ${response.status}: ${await response.text()}`);
        return null;
      }

      const data = (await response.json()) as IrisMessageResponse;

      if (!data.messages || data.messages.length === 0) {
        return null;
      }

      const msg = data.messages[0];
      if (msg.status === "complete" && msg.attestation) {
        return {
          attestation: msg.attestation,
          message: msg.message,
          status: msg.status,
        };
      }

      // Return status for logging (pending, pending_confirmations)
      return { attestation: "", message: "", status: msg.status };
    } catch (e: any) {
      console.warn(`    [iris] Poll error: ${e.message}`);
      return null;
    }
  }

  getUrl(sourceDomain: number, sourceTxHash: string): string {
    return `${this.baseUrl}/v2/messages/${sourceDomain}?transactionHash=${sourceTxHash}`;
  }
}

// ============ Iris Relay Module ============

export class IrisRelayModule {
  private chains: Map<number, ChainState> = new Map();
  private isRunning: boolean = false;
  private pollIntervalMs: number;
  private irisClient: IrisClient;
  private pendingMessages: Map<string, PendingMessage> = new Map();
  private cursorStore: CursorStore;

  constructor() {
    const { iris } = armadaRelayerSettings;
    this.pollIntervalMs = armadaRelayerSettings.cctpPollIntervalMs;
    this.irisClient = new IrisClient(iris.apiUrl);
    this.cursorStore = new CursorStore(RELAYER_STATE_DIR);
  }

  async initialize(): Promise<boolean> {
    console.log("[iris-relay] Initializing real CCTP relay module...");
    console.log(`[iris-relay] Iris API: ${armadaRelayerSettings.iris.apiUrl}`);

    let allInitialized = true;

    for (const chainConfig of allChains) {
      const state = await this.initChain(chainConfig);
      if (state) {
        this.chains.set(state.domain, state);
        console.log(
          `  [iris-relay] ${chainConfig.name} (Chain ${chainConfig.chainId}, Domain ${state.domain})`
        );
        console.log(`    MessageTransmitter: ${state.messageTransmitter}`);
        console.log(`    HookRouter: ${state.hookRouter || "not configured"}`);
        if (state.knownRecipients.size > 0) {
          console.log(`    Known recipients: ${Array.from(state.knownRecipients).map(r => r.slice(0, 20) + "...").join(", ")}`);
        }
      } else {
        console.log(
          `  [iris-relay] ${chainConfig.name} (${chainConfig.chainId}): Failed to initialize`
        );
        allInitialized = false;
      }
    }

    console.log(
      `[iris-relay] Initialized ${this.chains.size}/${allChains.length} chains`
    );
    return allInitialized;
  }

  private async initChain(chainConfig: ChainConfig): Promise<ChainState | null> {
    try {
      const deployment = loadDeployment(chainConfig.deploymentFile);
      if (!deployment) {
        console.error(`    Deployment file not found: ${chainConfig.deploymentFile}`);
        return null;
      }

      const { messageTransmitter } = deployment.contracts;
      if (!messageTransmitter) {
        console.error(`    Missing messageTransmitter in deployment`);
        return null;
      }

      // Load hookRouter and known recipient addresses from privacy pool deployment
      let hookRouter: string | null = null;
      const knownRecipients = new Set<string>();
      const ppDeployment = loadDeployment(chainConfig.privacyPoolDeploymentFile);
      if (ppDeployment?.contracts?.hookRouter) {
        hookRouter = ppDeployment.contracts.hookRouter;
      }
      // Collect known CCTP recipient addresses for this chain (used to filter foreign messages)
      const poolAddr = ppDeployment?.contracts?.privacyPool || ppDeployment?.contracts?.privacyPoolClient;
      if (poolAddr) {
        knownRecipients.add(ethers.zeroPadValue(poolAddr, 32).toLowerCase());
      }

      const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
      const wallet = new ethers.Wallet(accounts.deployer.privateKey, provider);

      // Verify connection up-front with the same timeout we'll use during polling.
      const currentBlock = Number(
        await withTimeout(
          provider.getBlockNumber(),
          chainConfig.scanner.rpcTimeoutMs,
          `initChain getBlockNumber ${chainConfig.name}`,
        ),
      );

      // Load persisted cursor or bootstrap from lookback. This is the fix for the cold-start
      // hole: the prior code set lastProcessedBlock = currentBlock and silently skipped any
      // MessageSent emitted before the relayer started OR during a restart window.
      const lastProcessedBlock = await this.resolveBootCursor(chainConfig, currentBlock);

      return {
        config: chainConfig,
        provider,
        wallet,
        messageTransmitter,
        hookRouter,
        knownRecipients,
        domain: chainConfig.cctpDomain,
        lastProcessedBlock,
        processedMessages: new Set(),
        lastError: null,
        lastScanAt: 0,
      };
    } catch (e: any) {
      console.error(`    Connection error: ${e.message}`);
      return null;
    }
  }

  /**
   * Decide the starting `lastProcessedBlock` for a chain on cold boot. Three cases:
   *
   *   1. A valid cursor file exists AND the gap to chain head is reasonable → resume from it.
   *      We replay anything between the persisted cursor and the current head. The contract's
   *      "already processed" check absorbs any duplicate relays at a small gas cost.
   *
   *   2. A cursor file exists BUT the gap exceeds `maxBootLookbackBlocks` → the relayer was
   *      offline for so long that a full backfill would burn through RPC quota for messages
   *      Iris has long since expired anyway. Cap at `currentBlock - bootLookbackBlocks` and
   *      emit a loud warning so the operator knows historical messages were skipped.
   *
   *   3. No cursor file (true cold start / fresh deployment) → bootstrap from
   *      `currentBlock - bootLookbackBlocks` so we recover any MessageSent in the recent past.
   *      Previously this branch set lastProcessed = currentBlock, dropping in-flight messages.
   */
  private async resolveBootCursor(
    chainConfig: ChainConfig,
    currentBlock: number,
  ): Promise<number> {
    const { bootLookbackBlocks, maxBootLookbackBlocks } = chainConfig.scanner;
    const lookbackFloor = Math.max(0, currentBlock - bootLookbackBlocks);

    let cursor;
    try {
      cursor = await this.cursorStore.read(chainConfig.name);
    } catch (err: any) {
      // A malformed cursor file is operator-actionable but we must not crash the relayer on
      // startup. Log loudly and fall through to lookback bootstrap.
      console.error(
        `  [iris-relay] ${chainConfig.name}: Cursor file unreadable (${err.message}). Bootstrapping from lookback floor — DELETE the cursor file at relayer/state/cursor-${chainConfig.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}.json after investigating.`,
      );
      cursor = null;
    }

    if (cursor === null) {
      console.log(
        `  [iris-relay] ${chainConfig.name}: No persisted cursor — starting from block ${lookbackFloor} (currentBlock=${currentBlock}, lookback=${bootLookbackBlocks})`,
      );
      return lookbackFloor;
    }

    const gap = currentBlock - cursor.lastProcessedBlock;
    if (gap <= 0) {
      // Cursor is at or ahead of chain head (chain reorg? cursor written then chain reset?).
      // Reset to current head to avoid scanning the future.
      console.warn(
        `  [iris-relay] ${chainConfig.name}: Cursor ${cursor.lastProcessedBlock} ≥ currentBlock ${currentBlock}. Resetting to currentBlock.`,
      );
      return currentBlock;
    }

    if (gap > maxBootLookbackBlocks) {
      console.warn(
        `  [iris-relay] ${chainConfig.name}: Cursor gap (${gap} blocks) exceeds maxBootLookbackBlocks (${maxBootLookbackBlocks}). Capping resume at block ${lookbackFloor}. Messages between ${cursor.lastProcessedBlock} and ${lookbackFloor} will NOT be relayed — Iris will have expired their attestations anyway. Manual recovery via Iris API + relayWithHook if needed.`,
      );
      return lookbackFloor;
    }

    console.log(
      `  [iris-relay] ${chainConfig.name}: Resuming from persisted cursor at block ${cursor.lastProcessedBlock} (gap=${gap} blocks)`,
    );
    return cursor.lastProcessedBlock;
  }

  private getChainByDomain(domain: number): ChainState | undefined {
    return this.chains.get(domain);
  }

  // ========== Event Scanning ==========

  /**
   * Poll a chain for new MessageSent events from real CCTP. Resilient against the failure modes
   * that produced the original silent-stall incident:
   *
   *  - **Bounded chunking**: every `getLogs` call spans at most `maxLogRange` blocks. After any
   *    pause/outage, the catch-up window is processed in chunks so we never trip the public
   *    RPC's range cap (~500 on Alchemy, ~1024 on drpc).
   *
   *  - **Per-chunk cursor persistence**: each successful chunk writes the cursor to disk via
   *    `onChunk`. A failure mid-range loses at most ONE chunk of work on the next tick, never
   *    the whole window.
   *
   *  - **Confirmation depth**: scans only up to `currentBlock - confirmationDepth` so a reorg
   *    between detection and `relayWithHook` can't have us submitting attestations for vanished
   *    messages.
   *
   *  - **RPC timeouts**: every provider call is wrapped in `withTimeout`, so a dead socket
   *    can't pin the poll loop indefinitely.
   *
   *  - **Loud errors**: replaces the swallow-everything `catch {}` with structured logging and
   *    a `lastError` field on chain state. The cursor does NOT advance on error — next tick
   *    retries from the same fromBlock, with the chunker shrinking the window if needed.
   */
  private async pollChain(state: ChainState): Promise<void> {
    const { config } = state;
    const { confirmationDepth, maxLogRange, rpcTimeoutMs } = config.scanner;

    try {
      const currentBlock = Number(
        await withTimeout(
          state.provider.getBlockNumber(),
          rpcTimeoutMs,
          `getBlockNumber ${config.name}`,
        ),
      );

      // Apply confirmation depth — don't scan tip-of-chain blocks that might be reorg'd out.
      const effectiveHead = currentBlock - confirmationDepth;
      if (effectiveHead <= state.lastProcessedBlock) {
        // No new "safe" blocks since last scan; common steady-state path.
        state.lastError = null;
        state.lastScanAt = Date.now();
        return;
      }

      const fromBlock = state.lastProcessedBlock + 1;
      const toBlock = effectiveHead;

      // Real CCTP emits: event MessageSent(bytes message)
      const iface = new ethers.Interface(REAL_MESSAGE_SENT_ABI);
      const eventTopic = iface.getEvent("MessageSent")?.topicHash;
      if (!eventTopic) return;

      await getLogsChunked(state.provider, {
        fromBlock,
        toBlock,
        maxRange: maxLogRange,
        filter: {
          address: state.messageTransmitter,
          topics: [eventTopic],
        },
        // Ingest + cursor-advance happen INSIDE the per-chunk callback so the on-disk cursor
        // is always ≤ what's been enqueued. A crash between chunks loses zero un-ingested
        // logs: the cursor reflects the last fully-ingested chunk.
        onChunk: async ({ fromBlock: chunkFrom, toBlockInclusive, logs }) => {
          if (logs.length > 0) {
            console.log(
              `\n[iris-relay] ${config.name}: Found ${logs.length} message(s) in blocks ${chunkFrom}-${toBlockInclusive}`,
            );
          }
          for (const log of logs) {
            this.enqueueMessage(log, state);
          }
          state.lastProcessedBlock = toBlockInclusive;
          await this.cursorStore.write(config.name, {
            lastProcessedBlock: toBlockInclusive,
            updatedAt: Date.now(),
          });
        },
      });

      state.lastError = null;
      state.lastScanAt = Date.now();
    } catch (err: any) {
      // NO LONGER SILENT. Structured error log + state.lastError so the future health endpoint
      // can surface a stuck scanner. Cursor stays put so the next tick retries the same window.
      const message = err instanceof RpcTimeoutError
        ? `RPC timeout: ${err.label}`
        : err?.message ?? "unknown error";
      state.lastError = { message, at: Date.now() };
      console.error(
        `[iris-relay] ${state.config.name}: Scan tick failed: ${message}. Cursor stays at ${state.lastProcessedBlock}; will retry next tick.`,
      );
    }
  }

  /**
   * Parse a MessageSent event and add it to the pending queue.
   */
  private enqueueMessage(log: ethers.Log, sourceState: ChainState): void {
    const iface = new ethers.Interface(REAL_MESSAGE_SENT_ABI);
    const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed) return;

    const messageBytes: string = parsed.args[0];
    const messageHash = ethers.keccak256(messageBytes);

    // Already processed or already queued
    if (sourceState.processedMessages.has(messageHash)) return;
    if (this.pendingMessages.has(messageHash)) return;

    const { sourceDomain, destinationDomain, nonce, mintRecipient, destinationCaller } = parseMessageFields(messageBytes);

    const destState = this.getChainByDomain(destinationDomain);
    if (!destState) {
      console.log(`  [iris-relay] Unknown destination domain ${destinationDomain}, skipping`);
      return;
    }

    // Filter: only relay messages where BurnMessageV2.mintRecipient matches our contracts.
    // On real CCTP V2, the MessageV2.recipient is always the dest TokenMessenger (shared),
    // so we check mintRecipient (the actual contract that receives minted tokens).
    if (destState.knownRecipients.size > 0 && mintRecipient && !destState.knownRecipients.has(mintRecipient)) {
      // Not our message — someone else's CCTP transfer on the shared MessageTransmitter
      return;
    }

    // Filter: if destinationCaller is set and doesn't match our hookRouter, skip
    const zeroCaller = "0x" + "0".repeat(64);
    if (destinationCaller !== zeroCaller && destState.hookRouter) {
      const ourHookRouterBytes32 = ethers.zeroPadValue(destState.hookRouter, 32).toLowerCase();
      if (destinationCaller !== ourHookRouterBytes32) {
        console.log(`  [iris-relay] Message destinationCaller ${destinationCaller.slice(0, 20)}... doesn't match our HookRouter, skipping`);
        return;
      }
    }

    const pending: PendingMessage = {
      messageBytes,
      messageHash,
      sourceDomain,
      destinationDomain,
      nonce,
      sourceTxHash: log.transactionHash,
      sourceBlock: log.blockNumber,
      detectedAt: Date.now(),
      pollAttempts: 0,
      lastStatus: "new",
    };

    this.pendingMessages.set(messageHash, pending);

    const irisUrl = this.irisClient.getUrl(sourceDomain, log.transactionHash);

    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `[iris-relay] QUEUED: ${sourceState.config.name} (Domain ${sourceDomain}) -> ${destState.config.name} (Domain ${destinationDomain})`
    );
    console.log(`${"=".repeat(60)}`);
    console.log(`  Msg Hash:    ${messageHash}`);
    console.log(`  Source Tx:   ${log.transactionHash}`);
    console.log(`  MintRecipient: ${mintRecipient || "unknown"}`);
    console.log(`  Msg length:  ${(messageBytes.length - 2) / 2} bytes`);
    console.log(`  Iris URL:    ${irisUrl}`);
    console.log(`  Queued for attestation polling (non-blocking)`);
  }

  // ========== Attestation Polling & Relay ==========

  /**
   * Check all pending messages for attestations and relay any that are ready.
   * Called once per poll cycle — never blocks.
   */
  private async processPendingMessages(): Promise<void> {
    if (this.pendingMessages.size === 0) return;

    const entries = Array.from(this.pendingMessages.entries());
    for (const [hash, msg] of entries) {
      // Check if expired
      const age = Date.now() - msg.detectedAt;
      if (age > MAX_ATTESTATION_AGE_MS) {
        console.log(
          `\n[iris-relay] EXPIRED: message ${hash.slice(0, 18)}... after ${elapsed(msg.detectedAt)} ` +
          `(${msg.pollAttempts} polls, last status: ${msg.lastStatus})`
        );
        console.log(`  Source Tx: ${msg.sourceTxHash}`);
        console.log(`  Iris URL:  ${this.irisClient.getUrl(msg.sourceDomain, msg.sourceTxHash)}`);
        this.pendingMessages.delete(hash);
        continue;
      }

      // Check Iris
      msg.pollAttempts++;
      const result = await this.irisClient.checkAttestation(
        msg.sourceDomain,
        msg.sourceTxHash
      );

      if (!result) {
        // Not indexed yet or error — log periodically
        if (msg.pollAttempts % 6 === 0) {
          console.log(
            `  [iris-relay] ${hash.slice(0, 18)}... not yet indexed (${elapsed(msg.detectedAt)}, ${msg.pollAttempts} polls)`
          );
        }
        continue;
      }

      if (!result.attestation) {
        // Have a status but no attestation yet
        msg.lastStatus = result.status;
        if (msg.pollAttempts % 6 === 0) {
          console.log(
            `  [iris-relay] ${hash.slice(0, 18)}... status: ${result.status} (${elapsed(msg.detectedAt)}, ${msg.pollAttempts} polls)`
          );
        }
        continue;
      }

      // Attestation ready — relay it
      console.log(
        `\n[iris-relay] ATTESTATION READY for ${hash.slice(0, 18)}... after ${elapsed(msg.detectedAt)} (${msg.pollAttempts} polls)`
      );

      const relayed = await this.relayMessage(msg, result.attestation, result.message);
      if (relayed) {
        // Mark as processed on the source chain state
        const sourceState = this.getChainByDomain(msg.sourceDomain);
        if (sourceState) sourceState.processedMessages.add(hash);
      }
      this.pendingMessages.delete(hash);
    }
  }

  /**
   * Submit receiveMessage on the destination chain.
   */
  private async relayMessage(
    msg: PendingMessage,
    attestation: string,
    irisMessage: string
  ): Promise<boolean> {
    const destState = this.getChainByDomain(msg.destinationDomain);
    if (!destState) {
      console.error(`  [iris-relay] No chain for destination domain ${msg.destinationDomain}`);
      return false;
    }

    try {
      // Prefer the message from Iris (may include finalityThresholdExecuted filled in)
      const msgToRelay = irisMessage || msg.messageBytes;

      console.log(`  Source Tx: ${msg.sourceTxHash}`);

      // Use hookRouter.relayWithHook() to atomically call receiveMessage + hook dispatch
      let tx: ethers.ContractTransactionResponse;
      if (destState.hookRouter) {
        const hookRouter = new ethers.Contract(
          destState.hookRouter,
          HOOK_ROUTER_ABI,
          destState.wallet
        );
        console.log(`  Sending relayWithHook to ${destState.config.name} via CCTPHookRouter...`);
        tx = await hookRouter.relayWithHook(msgToRelay, attestation);
      } else {
        const messageTransmitter = new ethers.Contract(
          destState.messageTransmitter,
          REAL_MESSAGE_TRANSMITTER_ABI,
          destState.wallet
        );
        console.log(`  Sending receiveMessage to ${destState.config.name}...`);
        tx = await messageTransmitter.receiveMessage(msgToRelay, attestation);
      }
      console.log(`  Tx hash: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`  Confirmed in block ${receipt?.blockNumber}`);
      console.log(`  Relay successful`);
      return true;
    } catch (e: any) {
      if (
        e.message?.includes("already processed") ||
        e.message?.includes("Nonce already used")
      ) {
        console.log(`  Already processed on-chain, marking as done`);
        return true;
      }
      console.error(`  [iris-relay] Relay failed: ${e.message || e}`);
      return false;
    }
  }

  // ========== Lifecycle ==========

  start(): void {
    if (this.chains.size === 0) {
      console.warn("[iris-relay] No chains initialized, skipping start");
      return;
    }

    const chainsSummary = Array.from(this.chains.values())
      .map(
        (s) =>
          `  ${s.config.name}: Domain ${s.domain} (Chain ${s.config.chainId})`
      )
      .join("\n");

    console.log(`[iris-relay] Started polling ${this.chains.size} chain(s):`);
    console.log(chainsSummary);
    console.log(`[iris-relay] Poll interval: ${this.pollIntervalMs}ms`);
    console.log(`[iris-relay] Max attestation wait: ${MAX_ATTESTATION_AGE_MS / 60000} minutes`);

    this.isRunning = true;
    this.runPollLoop();
  }

  /** Resolved by `runPollLoop` when it observes isRunning=false and exits. `stop()` awaits it. */
  private loopExited: Promise<void> | null = null;
  private resolveLoopExited: (() => void) | null = null;

  private async runPollLoop(): Promise<void> {
    this.loopExited = new Promise((resolve) => {
      this.resolveLoopExited = resolve;
    });
    try {
      while (this.isRunning) {
        // 1. Scan all chains for new MessageSent events
        const chainStates = Array.from(this.chains.values());
        for (const state of chainStates) {
          if (!this.isRunning) break;
          await this.pollChain(state);
        }

        if (!this.isRunning) break;

        // 2. Check pending messages for attestations and relay
        await this.processPendingMessages();

        if (!this.isRunning) break;

        // 3. Sleep before next cycle — abort early if stop() fires.
        await this.sleepCancellable(this.pollIntervalMs);
      }
    } finally {
      this.resolveLoopExited?.();
    }
  }

  /**
   * Like `setTimeout` but resolves immediately when `isRunning` flips to false, so a shutdown
   * doesn't have to wait out the full poll interval before flushing. Checks every 100ms — small
   * enough to be unnoticeable on shutdown latency, large enough not to busy-loop.
   */
  private async sleepCancellable(totalMs: number): Promise<void> {
    const start = Date.now();
    const step = 100;
    while (this.isRunning && Date.now() - start < totalMs) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(step, totalMs - (Date.now() - start))));
    }
  }

  /**
   * Async, awaitable shutdown. Flips the run flag, waits for the current poll tick to complete
   * (so an in-flight `getLogs` finishes and its cursor write lands), then resolves. The caller
   * in `armada-relayer.ts` MUST await this before `process.exit` — otherwise a kill-9 mid-poll
   * could happen between the on-disk cursor write and the in-memory advance, defeating the
   * crash-safety guarantee.
   *
   * Idempotent — calling twice is a no-op on the second call.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    console.log("[iris-relay] Stopping — waiting for in-flight scan tick to complete...");
    if (this.pendingMessages.size > 0) {
      console.log(`[iris-relay] ${this.pendingMessages.size} pending message(s) will be abandoned`);
    }
    this.isRunning = false;
    if (this.loopExited) await this.loopExited;
    console.log("[iris-relay] Stopped cleanly.");
  }

  get chainCount(): number {
    return this.chains.size;
  }
}
