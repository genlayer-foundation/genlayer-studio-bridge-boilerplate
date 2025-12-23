# Opening GenLayer to All Blockchains

## The Blind Spot

Blockchains are powerful, but they're blind. The most successful layer 1 and layer 2 chains can execute complex logic, hold billions in value, and process thousands of transactions. But they cannot look up last night's sports score, read a news article, or verify if a real-world event actually happened.

This creates a fundamental problem. Every time a dApp needs real-world information, it relies on oracles: centralized services that push data on-chain. These oracles work, but they introduce trust assumptions that undermine the whole point of decentralization.

GenLayer offers a different approach. Instead of being just another blockchain, we're building the Resolution Layer for the entire ecosystem. Any blockchain can offload complex, non-deterministic work (AI reasoning, web access, data verification) to GenLayer and get a verified result back.

## Bridging Intelligence

GenLayer isn't meant to exist in isolation. From day one, we designed it to plug into existing networks, meeting developers where they already are.

We chose LayerZero as our first transport layer for a simple reason: reach. LayerZero connects 130+ blockchains, spanning both EVM and non-EVM chains. It has processed over $50B in volume and delivered 130M+ cross-chain messages. Most importantly, it has zero core protocol exploits, a stark contrast to the $2B+ lost to bridge attacks elsewhere.

By building on LayerZero, GenLayer inherits connectivity to the entire blockchain ecosystem from day one. The flow is straightforward:

1. A dApp on a source chain (say, Base) sends a query
2. The message travels via LayerZero
3. GenLayer receives it, and an Intelligent Contract executes
4. Validators reach consensus on the result
5. The answer is sent back to the source chain

Your dApp asks a question. GenLayer figures out the answer. You get a verified response.

While we've built this template on LayerZero, the architecture isn't locked to any single transport provider. Protocols like Hyperlane, Axelar and IBC follow similar patterns: endpoints that send and receive bytes, off-chain relayers that move messages, and receiver contracts that process them. The core logic stays the same. If your team already uses a different messaging protocol, adapting this boilerplate is straightforward. GenLayer doesn't care how the message arrives, only that it does.

## How the Bridge Works

GenLayer operates as a hub, with other blockchains connecting as spokes. Let's trace the data flow through this architecture.

On the EVM side, a sender contract acts as the mailbox. DApps send their queries here as raw bytes. The contract wraps the data with metadata and hands it to LayerZero. An off-chain bridge service watches for these events and relays them to GenLayer, where a receiver contract validates and immediately dispatches messages to the target Intelligent Contract via contract-to-contract calls. The target contract's callback function receives the message, processes it, and the result travels back through the same path in reverse: emit, relay, deliver.

Because GenLayer performs complex tasks like web crawling and AI inference, the bridge is asynchronous by design. You send a request, the answer comes back in a separate transaction. The bridge protects the network through authorized relayers who are the only ones permitted to submit messages, preventing spam and flooding attacks. The bridge itself is agnostic to what you're sending since it uses standard byte payloads, so it works with any dApp logic. Fees are quoted upfront in your source chain's native token, so you know exactly what you're paying before anything leaves your chain.

## A Real Example: Cross-Chain Prediction Markets

Let's make this concrete. Imagine a prediction market on Base where users bet USDC on sports outcomes.

The market works great until it's time to settle. Base cannot know who won last night's game. It can't check ESPN. It can't read the NBA website. So traditionally, you'd need to trust someone to push that data on-chain. That's exactly the trust assumption we're trying to eliminate.

With GenLayer, the Base contract simply asks: "_Who won Lakers vs. Warriors on this date?_" An Intelligent Contract picks up the query, fetches data from ESPN, NBA.com, and a sports news API, then uses an LLM to parse the different page structures and confirm the winner. Validators reach consensus on the result. The answer bridges back to Base. The contract receives "_Warriors_", unlocks the pool, and pays out winners automatically.

No oracle server. No single point of failure. Just a decentralized network of validators reaching consensus on real-world truth.

## Using the Bridge Today

The bridge is ready for builders who want to get ahead. We're currently running on GenLayer Studio, which gives you a stable environment with persistent data storage, perfect for developing and testing your cross-chain applications before mainnet.

To handle message relaying, we've built an off-chain service that you deploy alongside your contracts. It polls and forwards messages between chains, giving you the full developer experience today. When mainnet launches, relaying becomes native to the protocol and this service is no longer needed. Your contracts stay the same.

To get started:

1. Clone the repository and follow the README
2. Deploy the EVM contracts to your target chains using Hardhat
3. Deploy the GenLayer contracts via Studio or CLI
4. Configure trust relationships between contracts
5. Run the bridge service

Once running, check out the included demo for a complete bidirectional messaging example with test utilities and step-by-step instructions.

GitHub: [genlayer-studio-bridge-boilerplate](https://github.com/genlayer-foundation/genlayer-studio-bridge-boilerplate)

## The Resolution Layer Is Open

Every chain gets a brain. Your dApp stays where it is. Your liquidity doesn't move. You just plug into GenLayer and gain the one thing blockchains have never had: the ability to see the world.

Start building your first cross-chain Intelligent dApp. Don't miss our Builders Program at [points.genlayer.foundation](http://points.genlayer.foundation).
