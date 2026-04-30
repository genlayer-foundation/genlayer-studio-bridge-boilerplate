import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { getEnvVar, getEnvVarOrDefault, validateAddress } from "./utils";

dotenv.config();

async function main() {
  const inboxAddress = getEnvVar("HUB_INBOUND_INBOX_ADDRESS");
  const messageId = getArgValue("--message-id", process.env.MESSAGE_ID);
  const wait = process.argv.includes("--wait") || process.env.WAIT === "1";
  const timeoutMs = Number(getArgValue("--timeout-ms", getEnvVarOrDefault("WAIT_TIMEOUT_MS", "900000")));
  const pollMs = Number(getArgValue("--poll-ms", getEnvVarOrDefault("WAIT_POLL_MS", "15000")));

  validateAddress(inboxAddress, "HUB_INBOUND_INBOX_ADDRESS");
  if (!messageId || !ethers.isHexString(messageId, 32)) {
    throw new Error("Pass --message-id 0x... or set MESSAGE_ID to a bytes32 value.");
  }

  const inbox = await ethers.getContractAt("HubInboundInbox", inboxAddress);
  const started = Date.now();

  console.log("\nHub inbound inbox message lookup");
  console.log("  Inbox:", inboxAddress);
  console.log("  Message ID:", messageId);
  console.log("  Mode:", wait ? "wait" : "single-read");

  while (true) {
    const message = await inbox.getMessage(messageId);
    const count = await inbox.getMessageCount();
    if (message.messageId !== ethers.ZeroHash) {
      console.log("  Status: found");
      console.log("  Message count:", count.toString());
      console.log("  Source EID:", message.srcEid.toString());
      console.log("  Source sender:", message.srcSender);
      console.log("  Target:", message.target);
      console.log("  Payload hex:", message.payload);
      console.log("  Payload text:", decodeUtf8(message.payload));
      console.log("  Relayed:", message.relayed);
      return;
    }

    console.log("  Status: not found");
    console.log("  Message count:", count.toString());

    if (!wait || Date.now() - started >= timeoutMs) {
      process.exitCode = wait ? 1 : 0;
      return;
    }

    await sleep(pollMs);
  }
}

function getArgValue(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

function decodeUtf8(value: string): string {
  try {
    return ethers.toUtf8String(value);
  } catch {
    return "<non-utf8>";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
