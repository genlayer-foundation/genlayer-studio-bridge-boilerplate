import { PublicKey } from "@solana/web3.js";

const STORE_SEED = "Store";
const LZ_RECEIVE_TYPES_SEED = "LzReceiveTypes";

const [programIdArg] = process.argv.slice(2);
const programId = new PublicKey(
  programIdArg || "H4bMLhY9L8rB8kQrMbSeyy2KbQ2CYQnSvxqPro6vsy4J",
);
const [store] = PublicKey.findProgramAddressSync(
  [Buffer.from(STORE_SEED)],
  programId,
);
const [lzReceiveTypesAccounts] = PublicKey.findProgramAddressSync(
  [Buffer.from(LZ_RECEIVE_TYPES_SEED), store.toBuffer()],
  programId,
);

console.log(`program=${programId.toBase58()}`);
console.log(`store=${store.toBase58()}`);
console.log(`storeBytes32=0x${Buffer.from(store.toBytes()).toString("hex")}`);
console.log(`lzReceiveTypesAccounts=${lzReceiveTypesAccounts.toBase58()}`);
