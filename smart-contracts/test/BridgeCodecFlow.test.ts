import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import goldenVector from "../../test-vectors/bridge-envelope.json";
import {
  EvmChainInbox,
  EvmChainOutbox,
  HubInboundInbox,
  HubOutboundRouter,
  MockEndpoint,
  MockEndpointWithReceive,
  MockTarget,
} from "../typechain-types";

const VERSION = 1;
const GENLAYER_EID = 61998;

function addressToBytes32(address: string): string {
  return ethers.zeroPadValue(address, 32);
}

function encodeBridgeMessage(args: {
  messageId: string;
  srcEid: number;
  srcSender: string;
  target: string;
  payload: string;
}) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint16", "bytes32", "uint32", "bytes32", "bytes32", "bytes"],
    [VERSION, args.messageId, args.srcEid, args.srcSender, args.target, args.payload]
  );
}

describe("clean bridge roles", function () {
  let owner: SignerWithAddress;
  let relayer: SignerWithAddress;
  let user: SignerWithAddress;
  let executor: SignerWithAddress;

  beforeEach(async function () {
    [owner, relayer, user, executor] = await ethers.getSigners();
  });

  it("matches the canonical bridge envelope golden vector", async function () {
    const encoded = encodeBridgeMessage({
      messageId: goldenVector.messageId,
      srcEid: goldenVector.srcEid,
      srcSender: goldenVector.srcSender,
      target: goldenVector.target,
      payload: goldenVector.payload,
    });

    expect(encoded).to.equal(goldenVector.encoded);
  });

  describe("HubOutboundRouter", function () {
    let endpoint: MockEndpoint;
    let router: HubOutboundRouter;
    let target: MockTarget;

    beforeEach(async function () {
      const MockEndpoint = await ethers.getContractFactory("MockEndpoint");
      endpoint = await MockEndpoint.deploy();
      await endpoint.waitForDeployment();

      const HubOutboundRouter = await ethers.getContractFactory("HubOutboundRouter");
      router = await HubOutboundRouter.deploy(await endpoint.getAddress(), owner.address, relayer.address);
      await router.waitForDeployment();

      const MockTarget = await ethers.getContractFactory("MockTarget");
      target = await MockTarget.deploy();
      await target.waitForDeployment();
    });

    it("routes local GenLayer-originated messages to the target contract", async function () {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes("gl-local-message"));
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["hello"]);
      const srcSender = ethers.hexlify(ethers.randomBytes(32));
      const localEid = Number(await endpoint.eid());
      const message = encodeBridgeMessage({
        messageId,
        srcEid: GENLAYER_EID,
        srcSender,
        target: addressToBytes32(await target.getAddress()),
        payload,
      });

      await expect(router.connect(relayer).sendMessage(messageId, localEid, message, "0x"))
        .to.emit(router, "LocalMessageDelivered")
        .withArgs(messageId, await target.getAddress(), payload);

      expect(await target.called()).to.equal(true);
      expect(await target.lastMessageId()).to.equal(messageId);
      expect(await target.lastSrcEid()).to.equal(GENLAYER_EID);
      expect(await target.lastSourceSenderBytes32()).to.equal(srcSender);
      expect(await target.lastMessage()).to.equal(payload);
    });

    it("quotes and emits remote sends for configured destinations", async function () {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes("gl-remote-message"));
      const dstEid = 40245;
      const destinationEndpoint = ethers.hexlify(ethers.randomBytes(32));
      const message = encodeBridgeMessage({
        messageId,
        srcEid: GENLAYER_EID,
        srcSender: ethers.hexlify(ethers.randomBytes(32)),
        target: addressToBytes32(user.address),
        payload: "0x1234",
      });

      await router.connect(owner).setDestinationEndpoint(dstEid, destinationEndpoint);
      const [nativeFee, lzTokenFee] = await router.quoteMessage(dstEid, message, "0x");
      expect(nativeFee).to.equal(ethers.parseEther("1"));
      expect(lzTokenFee).to.equal(0);

      await expect(router.connect(relayer).sendMessage(messageId, dstEid, message, "0x"))
        .to.emit(router, "RemoteMessageSent")
        .withArgs(messageId, dstEid, destinationEndpoint, message);
    });

    it("rejects unauthorized relayers and duplicate message IDs", async function () {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes("duplicate"));
      const localEid = Number(await endpoint.eid());
      const message = encodeBridgeMessage({
        messageId,
        srcEid: GENLAYER_EID,
        srcSender: ethers.hexlify(ethers.randomBytes(32)),
        target: addressToBytes32(await target.getAddress()),
        payload: "0x1234",
      });

      await expect(router.connect(user).sendMessage(messageId, localEid, message, "0x"))
        .to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount");

      await router.connect(relayer).sendMessage(messageId, localEid, message, "0x");
      await expect(router.connect(relayer).sendMessage(messageId, localEid, message, "0x"))
        .to.be.revertedWith("HubOutboundRouter: message already used");
    });
  });

  describe("HubInboundInbox", function () {
    let endpoint: MockEndpointWithReceive;
    let inbox: HubInboundInbox;

    const srcEid = 40245;
    const sourceEndpoint = ethers.hexlify(ethers.randomBytes(32));
    const origin = {
      srcEid,
      sender: sourceEndpoint,
      nonce: 1,
    };

    beforeEach(async function () {
      const MockEndpointWithReceive = await ethers.getContractFactory("MockEndpointWithReceive");
      endpoint = await MockEndpointWithReceive.deploy();
      await endpoint.waitForDeployment();

      const HubInboundInbox = await ethers.getContractFactory("HubInboundInbox");
      inbox = await HubInboundInbox.deploy(await endpoint.getAddress(), owner.address);
      await inbox.waitForDeployment();

      await inbox.connect(owner).setTrustedSourceEndpoint(srcEid, sourceEndpoint);
    });

    it("stores source-chain messages for GenLayer relay", async function () {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes("evm-to-gl"));
      const srcSender = addressToBytes32(user.address);
      const target = addressToBytes32(owner.address);
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["resolve this"]);
      const message = encodeBridgeMessage({ messageId, srcEid, srcSender, target, payload });

      await expect(
        endpoint.callLzReceive(await inbox.getAddress(), origin, ethers.ZeroHash, message, executor.address, "0x")
      )
        .to.emit(inbox, "MessageQueued")
        .withArgs(messageId, srcEid, srcSender, target, payload);

      const stored = await inbox.getMessage(messageId);
      expect(stored.messageId).to.equal(messageId);
      expect(stored.srcEid).to.equal(srcEid);
      expect(stored.srcSender).to.equal(srcSender);
      expect(stored.target).to.equal(target);
      expect(stored.payload).to.equal(payload);
      expect(stored.relayed).to.equal(false);
    });

    it("requires trusted source endpoints and authorized relayers", async function () {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes("auth"));
      const message = encodeBridgeMessage({
        messageId,
        srcEid,
        srcSender: addressToBytes32(user.address),
        target: addressToBytes32(owner.address),
        payload: "0x1234",
      });

      await endpoint.callLzReceive(await inbox.getAddress(), origin, ethers.ZeroHash, message, executor.address, "0x");

      await expect(inbox.connect(user).markMessageRelayed(messageId))
        .to.be.revertedWith("HubInboundInbox: not authorized relayer");

      await inbox.connect(owner).setAuthorizedRelayer(relayer.address, true);
      await inbox.connect(relayer).markMessageRelayed(messageId);
      expect(await inbox.isMessageRelayed(messageId)).to.equal(true);
    });

    it("rejects duplicate messages and srcEid mismatches", async function () {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes("dup"));
      const message = encodeBridgeMessage({
        messageId,
        srcEid,
        srcSender: addressToBytes32(user.address),
        target: addressToBytes32(owner.address),
        payload: "0x1234",
      });

      await endpoint.callLzReceive(await inbox.getAddress(), origin, ethers.ZeroHash, message, executor.address, "0x");
      await expect(
        endpoint.callLzReceive(await inbox.getAddress(), origin, ethers.ZeroHash, message, executor.address, "0x")
      ).to.be.revertedWith("HubInboundInbox: duplicate message");

      const mismatched = encodeBridgeMessage({
        messageId: ethers.keccak256(ethers.toUtf8Bytes("bad-src")),
        srcEid: 999,
        srcSender: addressToBytes32(user.address),
        target: addressToBytes32(owner.address),
        payload: "0x1234",
      });
      await expect(
        endpoint.callLzReceive(await inbox.getAddress(), origin, ethers.ZeroHash, mismatched, executor.address, "0x")
      ).to.be.revertedWith("HubInboundInbox: srcEid mismatch");
    });
  });

  describe("EVM endpoint pair", function () {
    it("EvmChainOutbox packages source messages with canonical envelope", async function () {
      const MockEndpoint = await ethers.getContractFactory("MockEndpoint");
      const endpoint = await MockEndpoint.deploy();
      await endpoint.waitForDeployment();

      const hubEid = 40305;
      const hubInbox = ethers.hexlify(ethers.randomBytes(32));
      const EvmChainOutbox = await ethers.getContractFactory("EvmChainOutbox");
      const outbox: EvmChainOutbox = await EvmChainOutbox.deploy(
        await endpoint.getAddress(),
        owner.address,
        hubEid,
        hubInbox
      );
      await outbox.waitForDeployment();

      const payload = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["from evm"]);
      await expect(outbox.connect(user).sendToGenLayer(owner.address, payload, "0x"))
        .to.emit(outbox, "MessageSentToGenLayer");

      expect(await outbox.messageNonce()).to.equal(1);
    });

    it("EvmChainInbox verifies the hub router and dispatches to the target", async function () {
      const MockEndpointWithReceive = await ethers.getContractFactory("MockEndpointWithReceive");
      const endpoint = await MockEndpointWithReceive.deploy();
      await endpoint.waitForDeployment();

      const EvmChainInbox = await ethers.getContractFactory("EvmChainInbox");
      const inbox: EvmChainInbox = await EvmChainInbox.deploy(await endpoint.getAddress(), owner.address);
      await inbox.waitForDeployment();

      const MockTarget = await ethers.getContractFactory("MockTarget");
      const target: MockTarget = await MockTarget.deploy();
      await target.waitForDeployment();

      const hubEid = 40305;
      const hubRouter = ethers.hexlify(ethers.randomBytes(32));
      await inbox.connect(owner).setTrustedHubRouter(hubEid, hubRouter);

      const messageId = ethers.keccak256(ethers.toUtf8Bytes("gl-to-evm"));
      const srcSender = ethers.hexlify(ethers.randomBytes(32));
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["from genlayer"]);
      const message = encodeBridgeMessage({
        messageId,
        srcEid: GENLAYER_EID,
        srcSender,
        target: addressToBytes32(await target.getAddress()),
        payload,
      });

      const origin = { srcEid: hubEid, sender: hubRouter, nonce: 1 };
      await endpoint.callLzReceive(await inbox.getAddress(), origin, ethers.ZeroHash, message, executor.address, "0x");

      expect(await target.called()).to.equal(true);
      expect(await target.lastMessageId()).to.equal(messageId);
      expect(await target.lastSrcEid()).to.equal(GENLAYER_EID);
      expect(await target.lastSourceSenderBytes32()).to.equal(srcSender);
      expect(await target.lastMessage()).to.equal(payload);
    });
  });
});
