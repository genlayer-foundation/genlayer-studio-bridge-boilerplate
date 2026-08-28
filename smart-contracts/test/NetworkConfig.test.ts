import { expect } from "chai";
import {
  assertChainId,
  getEvmNetworkProfile,
  getRequiredLayerZeroEndpoint,
} from "../scripts/network-config";

describe("Network configuration", function () {
  it("defines the supported hub and target profiles", function () {
    expect(getEvmNetworkProfile("zkSyncSepoliaTestnet")).to.deep.include({
      chainId: 300,
      layerZeroEid: 40305,
      role: "hub",
    });
    expect(getEvmNetworkProfile("baseSepoliaTestnet")).to.deep.include({
      chainId: 84532,
      layerZeroEid: 40245,
      role: "target",
    });
  });

  it("rejects unknown networks", function () {
    expect(() => getEvmNetworkProfile("unknown")).to.throw("Unsupported EVM network");
  });

  it("rejects an RPC connected to the wrong chain", function () {
    const profile = getEvmNetworkProfile("baseSepoliaTestnet");
    expect(() => assertChainId(profile, 1n)).to.throw("expected 84532");
  });

  it("requires a valid LayerZero endpoint address", function () {
    expect(getRequiredLayerZeroEndpoint({
      LAYERZERO_ENDPOINT: "0x1111111111111111111111111111111111111111",
    })).to.equal("0x1111111111111111111111111111111111111111");
    expect(() => getRequiredLayerZeroEndpoint({})).to.throw("LAYERZERO_ENDPOINT");
    expect(() => getRequiredLayerZeroEndpoint({ LAYERZERO_ENDPOINT: "0x1234" }))
      .to.throw("20-byte EVM address");
  });
});
