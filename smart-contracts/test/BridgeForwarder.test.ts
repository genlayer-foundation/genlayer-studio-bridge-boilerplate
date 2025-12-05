import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { MockEndpoint, MockTarget, BridgeForwarder } from "../typechain-types";

describe("BridgeForwarder", function () {
  let bridgeForwarder: BridgeForwarder;
  let mockEndpoint: MockEndpoint;
  let mockTarget: MockTarget;
  let owner: SignerWithAddress;
  let caller: SignerWithAddress;
  let user: SignerWithAddress;

  beforeEach(async function () {
    // Get signers
    [owner, caller, user] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint
    const MockEndpoint = await ethers.getContractFactory("MockEndpoint");
    mockEndpoint = await MockEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy mock target contract
    const MockTarget = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTarget.deploy();
    await mockTarget.waitForDeployment();

    // Deploy BridgeForwarder
    const BridgeForwarder = await ethers.getContractFactory("BridgeForwarder");
    bridgeForwarder = await BridgeForwarder.deploy(
      await mockEndpoint.getAddress(),
      owner.address,
      caller.address
    );
    await bridgeForwarder.waitForDeployment();
  });

  describe("Constructor", function () {
    it("Should set the endpoint address correctly", async function () {
      expect(await bridgeForwarder.endpoint()).to.equal(await mockEndpoint.getAddress());
    });

    it("Should set the owner correctly", async function () {
      const OWNER_ROLE = await bridgeForwarder.OWNER_ROLE();
      expect(await bridgeForwarder.hasRole(OWNER_ROLE, owner.address)).to.be.true;
    });

    it("Should set the caller correctly", async function () {
      const CALLER_ROLE = await bridgeForwarder.CALLER_ROLE();
      expect(await bridgeForwarder.hasRole(CALLER_ROLE, caller.address)).to.be.true;
    });

    it("Should revert if endpoint address is zero", async function () {
      const BridgeForwarder = await ethers.getContractFactory("BridgeForwarder");
      await expect(
        BridgeForwarder.deploy(ethers.ZeroAddress, owner.address, caller.address)
      ).to.be.revertedWith("BridgeForwarder: _endpoint=0");
    });

    it("Should revert if owner address is zero", async function () {
      const BridgeForwarder = await ethers.getContractFactory("BridgeForwarder");
      await expect(
        BridgeForwarder.deploy(await mockEndpoint.getAddress(), ethers.ZeroAddress, caller.address)
      ).to.be.revertedWith("BridgeForwarder: _owner=0");
    });

    it("Should revert if caller address is zero", async function () {
      const BridgeForwarder = await ethers.getContractFactory("BridgeForwarder");
      await expect(
        BridgeForwarder.deploy(await mockEndpoint.getAddress(), owner.address, ethers.ZeroAddress)
      ).to.be.revertedWith("BridgeForwarder: _caller=0");
    });
  });

  describe("Role Management", function () {
    describe("updateCaller", function () {
      const newCaller = ethers.Wallet.createRandom().address;

      it("Should allow owner to update caller", async function () {
        const CALLER_ROLE = await bridgeForwarder.CALLER_ROLE();
        await bridgeForwarder.connect(owner).updateCaller(newCaller);
        expect(await bridgeForwarder.hasRole(CALLER_ROLE, newCaller)).to.be.true;
        expect(await bridgeForwarder.hasRole(CALLER_ROLE, caller.address)).to.be.false;
      });

      it("Should revert if caller is zero address", async function () {
        await expect(
          bridgeForwarder.connect(owner).updateCaller(ethers.ZeroAddress)
        ).to.be.revertedWith("BridgeForwarder: _newCaller=0");
      });

      it("Should revert if not called by owner", async function () {
        const OWNER_ROLE = await bridgeForwarder.OWNER_ROLE();
        await expect(
          bridgeForwarder.connect(user).updateCaller(newCaller)
        ).to.be.revertedWithCustomError(bridgeForwarder, "AccessControlUnauthorizedAccount")
        .withArgs(user.address, OWNER_ROLE);
      });
    });
  });

  describe("Bridge Address Management", function () {
    const dstEid = 2;
    const bridgeAddress = ethers.hexlify(ethers.randomBytes(32));

    describe("setBridgeAddress", function () {
      it("Should allow owner to set bridge address", async function () {
        await bridgeForwarder.connect(owner).setBridgeAddress(dstEid, bridgeAddress);
        expect(await bridgeForwarder.bridgeAddresses(dstEid)).to.equal(bridgeAddress);
      });

      it("Should emit BridgeAddressUpdated event", async function () {
        await expect(bridgeForwarder.connect(owner).setBridgeAddress(dstEid, bridgeAddress))
          .to.emit(bridgeForwarder, "BridgeAddressUpdated")
          .withArgs(dstEid, bridgeAddress);
      });

      it("Should revert if bridge address is zero", async function () {
        await expect(
          bridgeForwarder.connect(owner).setBridgeAddress(dstEid, ethers.ZeroHash)
        ).to.be.revertedWith("BridgeForwarder: _bridgeAddress=0");
      });

      it("Should revert if not called by owner", async function () {
        const OWNER_ROLE = await bridgeForwarder.OWNER_ROLE();
        await expect(
          bridgeForwarder.connect(user).setBridgeAddress(dstEid, bridgeAddress)
        ).to.be.revertedWithCustomError(bridgeForwarder, "AccessControlUnauthorizedAccount")
        .withArgs(user.address, OWNER_ROLE);
      });
    });

    describe("getBridgeAddress", function () {
      it("Should return the correct bridge address", async function () {
        await bridgeForwarder.connect(owner).setBridgeAddress(dstEid, bridgeAddress);
        expect(await bridgeForwarder.getBridgeAddress(dstEid)).to.equal(bridgeAddress);
      });

      it("Should revert if bridge address not set", async function () {
        await expect(
          bridgeForwarder.getBridgeAddress(dstEid)
        ).to.be.revertedWith("BridgeForwarder: bridge address not set");
      });
    });
  });

  describe("Cross-Chain Operations", function () {
    const dstEid = 2;
    const bridgeAddress = ethers.hexlify(ethers.randomBytes(32));
    const txHash = ethers.hexlify(ethers.randomBytes(32));
    const testMessage = "0x1234";

    beforeEach(async function () {
      await bridgeForwarder.connect(owner).setBridgeAddress(dstEid, bridgeAddress);
    });

    describe("callRemoteArbitrary", function () {
      it("Should revert if txHash already used", async function () {
        await bridgeForwarder.connect(caller).callRemoteArbitrary(txHash, dstEid, testMessage, "0x");
        await expect(
          bridgeForwarder.connect(caller).callRemoteArbitrary(txHash, dstEid, testMessage, "0x")
        ).to.be.revertedWith("BridgeForwarder: txHash already used");
      });

      it("Should revert if not called by caller", async function () {
        const CALLER_ROLE = await bridgeForwarder.CALLER_ROLE();
        await expect(
          bridgeForwarder.connect(user).callRemoteArbitrary(txHash, dstEid, testMessage, "0x")
        ).to.be.revertedWithCustomError(bridgeForwarder, "AccessControlUnauthorizedAccount")
        .withArgs(user.address, CALLER_ROLE);
      });

      it("Should revert if bridge address not set", async function () {
        const unknownEid = 999;
        await expect(
          bridgeForwarder.connect(caller).callRemoteArbitrary(txHash, unknownEid, testMessage, "0x")
        ).to.be.revertedWith("BridgeForwarder: bridge address not set");
      });

      it("Should emit RemoteBridgeSent event for cross-chain call", async function () {
        await expect(bridgeForwarder.connect(caller).callRemoteArbitrary(txHash, dstEid, testMessage, "0x"))
          .to.emit(bridgeForwarder, "RemoteBridgeSent")
          .withArgs(dstEid, bridgeAddress, testMessage);
      });

      it("Should handle local calls when dstEid matches local chain", async function () {
        const localEid = await mockEndpoint.eid();
        const message = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint32", "address", "address", "bytes"],
          [localEid, caller.address, await mockTarget.getAddress(), testMessage]
        );

        await bridgeForwarder.connect(caller).callRemoteArbitrary(txHash, localEid, message, "0x");

        expect(await mockTarget.called()).to.be.true;
        expect(await mockTarget.lastSrcEid()).to.equal(localEid);
        expect(await mockTarget.lastSrcSender()).to.equal(caller.address);
        expect(await mockTarget.lastMessage()).to.equal(testMessage);
      });
    });

    describe("quoteCallRemoteArbitrary", function () {
      it("Should return zero fees for local calls", async function () {
        const localEid = await mockEndpoint.eid();
        const [nativeFee, lzTokenFee] = await bridgeForwarder.quoteCallRemoteArbitrary(
          localEid,
          testMessage,
          "0x"
        );
        expect(nativeFee).to.equal(0);
        expect(lzTokenFee).to.equal(0);
      });

      it("Should return non-zero fees for cross-chain calls", async function () {
        const [nativeFee, lzTokenFee] = await bridgeForwarder.quoteCallRemoteArbitrary(
          dstEid,
          testMessage,
          "0x"
        );
        expect(nativeFee).to.be.gt(0);
        expect(lzTokenFee).to.equal(0);
      });

      it("Should revert if bridge address not set", async function () {
        const unknownEid = 999;
        await expect(
          bridgeForwarder.quoteCallRemoteArbitrary(unknownEid, testMessage, "0x")
        ).to.be.revertedWith("BridgeForwarder: bridge address not set");
      });
    });
  });
}); 