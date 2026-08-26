import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { getGenlayerRpcUrl, getNetworkProfile, getPrivateKey } from "./config.js";

export function createConfiguredGenLayerClient(): any {
  const profile = getNetworkProfile();
  const chain = profile.name === "studionet" ? studionet : testnetBradbury;
  const privateKey = getPrivateKey();
  const account = createAccount(`0x${privateKey.replace(/^0x/, "")}`);
  return createClient({
    chain: {
      ...chain,
      rpcUrls: { default: { http: [getGenlayerRpcUrl()] } },
    },
    account,
  });
}
