import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { MockEndpoint, MockTarget, BridgeReceiver, MockEndpointWithReceive } from "../typechain-types";

describe("BridgeReceiver", function () {
  let bridgeReceiver: BridgeReceiver;
  let mockEndpoint: MockEndpoint;
  let mockEndpointWithReceive: MockEndpointWithReceive;
  let mockTarget: MockTarget;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let executor: SignerWithAddress;

  beforeEach(async function () {
    // Get signers
    [owner, user, executor] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint
    const MockEndpoint = await ethers.getContractFactory("MockEndpoint");
    mockEndpoint = await MockEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy mock target contract
    const MockTarget = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTarget.deploy();
    await mockTarget.waitForDeployment();

    // Deploy BridgeReceiver
    const BridgeReceiver = await ethers.getContractFactory("BridgeReceiver");
    bridgeReceiver = await BridgeReceiver.deploy(
      await mockEndpoint.getAddress(),
      owner.address
    );
    await bridgeReceiver.waitForDeployment();
  });

  describe("Constructor", function () {
    it("Should set the endpoint address correctly", async function () {
      expect(await bridgeReceiver.endpoint()).to.equal(await mockEndpoint.getAddress());
    });

    it("Should set the owner correctly", async function () {
      expect(await bridgeReceiver.owner()).to.equal(owner.address);
    });

    it("Should revert if endpoint address is zero", async function () {
      const BridgeReceiver = await ethers.getContractFactory("BridgeReceiver");
      await expect(
        BridgeReceiver.deploy(ethers.ZeroAddress, owner.address)
      ).to.be.revertedWith("BridgeReceiver: _endpoint=0");
    });
  });

  describe("Trusted Forwarders", function () {
    const remoteEid = 2;
    const remoteForwarder = ethers.hexlify(ethers.randomBytes(32));

    describe("setTrustedForwarder", function () {
      it("Should allow owner to set trusted forwarder", async function () {
        await bridgeReceiver.connect(owner).setTrustedForwarder(remoteEid, remoteForwarder);
        expect(await bridgeReceiver.trustedForwarders(remoteEid)).to.equal(remoteForwarder);
      });

      it("Should emit TrustedForwarderSet event", async function () {
        await expect(bridgeReceiver.connect(owner).setTrustedForwarder(remoteEid, remoteForwarder))
          .to.emit(bridgeReceiver, "TrustedForwarderSet")
          .withArgs(remoteEid, remoteForwarder);
      });

      it("Should revert if caller is not owner", async function () {
        await expect(
          bridgeReceiver.connect(user).setTrustedForwarder(remoteEid, remoteForwarder)
        ).to.be.revertedWithCustomError(bridgeReceiver, "OwnableUnauthorizedAccount");
      });

      it("Should revert if forwarder is zero", async function () {
        await expect(
          bridgeReceiver.connect(owner).setTrustedForwarder(remoteEid, ethers.ZeroHash)
        ).to.be.revertedWith("BridgeReceiver: _remoteForwarder=0");
      });
    });

    describe("removeTrustedForwarder", function () {
      beforeEach(async function () {
        await bridgeReceiver.connect(owner).setTrustedForwarder(remoteEid, remoteForwarder);
      });

      it("Should allow owner to remove trusted forwarder", async function () {
        await bridgeReceiver.connect(owner).removeTrustedForwarder(remoteEid);
        expect(await bridgeReceiver.trustedForwarders(remoteEid)).to.equal(ethers.ZeroHash);
      });

      it("Should emit TrustedForwarderRemoved event", async function () {
        await expect(bridgeReceiver.connect(owner).removeTrustedForwarder(remoteEid))
          .to.emit(bridgeReceiver, "TrustedForwarderRemoved")
          .withArgs(remoteEid, remoteForwarder);
      });

      it("Should revert if caller is not owner", async function () {
        await expect(
          bridgeReceiver.connect(user).removeTrustedForwarder(remoteEid)
        ).to.be.revertedWithCustomError(bridgeReceiver, "OwnableUnauthorizedAccount");
      });

      it("Should revert if no forwarder is set", async function () {
        await bridgeReceiver.connect(owner).removeTrustedForwarder(remoteEid);
        await expect(
          bridgeReceiver.connect(owner).removeTrustedForwarder(remoteEid)
        ).to.be.revertedWith("BridgeReceiver: no forwarder set");
      });
    });
  });

  describe("allowInitializePath", function () {
    const remoteEid = 2;
    const remoteForwarder = ethers.hexlify(ethers.randomBytes(32));
    const origin = {
      srcEid: remoteEid,
      sender: remoteForwarder,
      nonce: 1
    };

    it("Should return false if forwarder is not trusted", async function () {
      expect(await bridgeReceiver.allowInitializePath(origin)).to.be.false;
    });

    it("Should return true if forwarder is trusted", async function () {
      await bridgeReceiver.connect(owner).setTrustedForwarder(remoteEid, remoteForwarder);
      expect(await bridgeReceiver.allowInitializePath(origin)).to.be.true;
    });
  });

  describe("nextNonce", function () {
    it("Should always return 0 (no ordering)", async function () {
      const eid = 2;
      const sender = ethers.hexlify(ethers.randomBytes(32));
      expect(await bridgeReceiver.nextNonce(eid, sender)).to.equal(0);
    });
  });

  describe("lzReceive", function () {
    const remoteEid = 2;
    const remoteForwarder = ethers.hexlify(ethers.randomBytes(32));
    const origin = {
      srcEid: remoteEid,
      sender: remoteForwarder,
      nonce: 1
    };
    const guid = ethers.hexlify(ethers.randomBytes(32));
    const extraData = "0x";

    beforeEach(async function () {
      // Deploy mock endpoint with ability to call lzReceive
      const MockEndpointWithReceive = await ethers.getContractFactory("MockEndpointWithReceive");
      mockEndpointWithReceive = await MockEndpointWithReceive.deploy();
      await mockEndpointWithReceive.waitForDeployment();

      // Deploy new BridgeReceiver with this endpoint
      const BridgeReceiver = await ethers.getContractFactory("BridgeReceiver");
      bridgeReceiver = await BridgeReceiver.deploy(
        await mockEndpointWithReceive.getAddress(),
        owner.address
      );
      await bridgeReceiver.waitForDeployment();

      // Set up trusted forwarder
      await bridgeReceiver.connect(owner).setTrustedForwarder(remoteEid, remoteForwarder);
    });

    it("Should revert if not called by endpoint", async function () {
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint32", "address", "address", "bytes"],
        [remoteEid, owner.address, await mockTarget.getAddress(), "0x"]
      );

      await expect(
        bridgeReceiver.lzReceive(origin, guid, message, executor.address, extraData)
      ).to.be.revertedWith("BridgeReceiver: only Endpoint can call");
    });

    it("Should revert if sender is not trusted forwarder", async function () {
      const untrustedOrigin = {
        ...origin,
        sender: ethers.hexlify(ethers.randomBytes(32))
      };
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint32", "address", "address", "bytes"],
        [remoteEid, owner.address, await mockTarget.getAddress(), "0x"]
      );

      await expect(
        mockEndpointWithReceive.callLzReceive(
          await bridgeReceiver.getAddress(),
          untrustedOrigin,
          guid,
          message,
          executor.address,
          extraData
        )
      ).to.be.revertedWith("BridgeReceiver: untrusted forwarder");
    });

    it("Should store a message with a zero target for relay-side validation", async function () {
      const messageId = ethers.hexlify(ethers.randomBytes(32));
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint32", "address", "address", "bytes", "bytes32"],
        [remoteEid, owner.address, ethers.ZeroAddress, "0x", messageId]
      );

      await mockEndpointWithReceive.callLzReceive(
        await bridgeReceiver.getAddress(),
        origin,
        guid,
        message,
        executor.address,
        extraData
      );
      const stored = await bridgeReceiver.getGenLayerMessage(messageId);
      expect(stored.targetContract).to.equal(ethers.ZeroAddress);
    });

    it("Should store the message for the relay service", async function () {
      const testMessage = "0x1234";
      const messageId = ethers.hexlify(ethers.randomBytes(32));
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint32", "address", "address", "bytes", "bytes32"],
        [remoteEid, owner.address, await mockTarget.getAddress(), testMessage, messageId]
      );

      await mockEndpointWithReceive.callLzReceive(
        await bridgeReceiver.getAddress(),
        origin,
        guid,
        message,
        executor.address,
        extraData
      );

      const stored = await bridgeReceiver.getGenLayerMessage(messageId);
      expect(stored.srcChainId).to.equal(remoteEid);
      expect(stored.srcSender).to.equal(owner.address);
      expect(stored.targetContract).to.equal(await mockTarget.getAddress());
      expect(stored.data).to.equal(testMessage);
      expect(await mockTarget.called()).to.be.false;
    });

    it("Should emit MessageForGenLayer for the relay service", async function () {
      const testMessage = "0x1234";
      const messageId = ethers.hexlify(ethers.randomBytes(32));
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint32", "address", "address", "bytes", "bytes32"],
        [remoteEid, owner.address, await mockTarget.getAddress(), testMessage, messageId]
      );

      await expect(
        mockEndpointWithReceive.callLzReceive(
          await bridgeReceiver.getAddress(),
          origin,
          guid,
          message,
          executor.address,
          extraData
        )
      )
        .to.emit(bridgeReceiver, "MessageForGenLayer")
        .withArgs(messageId, origin.srcEid, owner.address, await mockTarget.getAddress(), testMessage);
    });
  });
});
