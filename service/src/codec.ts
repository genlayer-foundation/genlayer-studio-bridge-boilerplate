import { ethers } from "ethers";

export const BRIDGE_ENVELOPE_VERSION = 1;

export interface BridgeEnvelope {
  version: number;
  messageId: string;
  srcEid: number;
  srcSender: string;
  target: string;
  payload: string;
}

const BRIDGE_ENVELOPE_TYPES = [
  "uint16",
  "bytes32",
  "uint32",
  "bytes32",
  "bytes32",
  "bytes",
] as const;

export function encodeBridgeEnvelope(envelope: BridgeEnvelope): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(BRIDGE_ENVELOPE_TYPES, [
    envelope.version,
    envelope.messageId,
    envelope.srcEid,
    envelope.srcSender,
    envelope.target,
    envelope.payload,
  ]);
}

export function decodeBridgeEnvelope(encoded: string): BridgeEnvelope {
  const [version, messageId, srcEid, srcSender, target, payload] =
    ethers.AbiCoder.defaultAbiCoder().decode(BRIDGE_ENVELOPE_TYPES, encoded);

  return {
    version: Number(version),
    messageId,
    srcEid: Number(srcEid),
    srcSender,
    target,
    payload,
  };
}

export function addressToBytes32(address: string): string {
  return ethers.zeroPadValue(address, 32);
}

export function bytes32ToAddress(value: string): string {
  const normalized = ethers.getBytes(value);
  if (normalized.length !== 32) {
    throw new Error(`Expected bytes32, got ${normalized.length} bytes`);
  }

  const highBytes = normalized.slice(0, 12);
  if (highBytes.some((byte) => byte !== 0)) {
    throw new Error(`bytes32 value is not an EVM/GenLayer address: ${value}`);
  }

  return ethers.getAddress(ethers.hexlify(normalized.slice(12)));
}

export function toHexBytes(value: unknown): string {
  if (typeof value === "string") {
    return value.startsWith("0x") ? value : `0x${value}`;
  }

  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return `0x${Buffer.from(value).toString("hex")}`;
  }

  throw new Error(`Unsupported byte value: ${String(value)}`);
}

export function toUint8Array(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value.replace(/^0x/, ""), "hex"));
}

export function mapValue<T = unknown>(value: unknown, key: string): T {
  if (value instanceof Map) {
    return value.get(key) as T;
  }

  if (value !== null && typeof value === "object" && key in value) {
    return (value as Record<string, T>)[key];
  }

  return undefined as T;
}
