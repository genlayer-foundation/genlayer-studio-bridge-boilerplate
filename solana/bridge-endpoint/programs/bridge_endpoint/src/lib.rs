#![allow(unexpected_cfgs)]

pub mod layerzero_v2;
pub mod msg_codec;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};
use layerzero_v2::{
    endpoint_clear, endpoint_quote, endpoint_register_oapp, endpoint_send, get_accounts_for_clear,
    AccountMetaRef, AddressLocator, ClearParams, Instruction, LzReceiveParams,
    LzReceiveTypesV2Accounts, LzReceiveTypesV2Result, MessagingFee, QuoteParams,
    RegisterOAppParams, SendParams, ENDPOINT_SEED,
    EXECUTION_CONTEXT_VERSION_1, LZ_RECEIVE_TYPES_VERSION,
};
use msg_codec::{decode_bridge_envelope, encode_bridge_envelope};

declare_id!("H4bMLhY9L8rB8kQrMbSeyy2KbQ2CYQnSvxqPro6vsy4J");

pub const STORE_SEED: &[u8] = b"Store";
pub const PEER_SEED: &[u8] = b"Peer";
pub const OUTBOUND_PEER_SEED: &[u8] = b"OutboundPeer";
pub const LZ_RECEIVE_TYPES_SEED: &[u8] = b"LzReceiveTypes";
pub const RECEIVER_SEED: &[u8] = b"Receiver";
pub const MESSAGE_SEED: &[u8] = b"Message";
pub const MESSAGE_STATUS_SEED: &[u8] = b"MessageStatus";
pub const RECEIVER_STATE_SEED: &[u8] = b"ReceiverState";

pub const RECEIVER_MODE_STORE_AND_CLAIM: u8 = 0;
pub const RECEIVER_MODE_DIRECT: u8 = 1;
pub const MAX_PAYLOAD_LEN: usize = 1024;

#[program]
pub mod bridge_endpoint {
    use super::*;

    pub fn init(
        ctx: Context<Init>,
        admin: Pubkey,
        endpoint_program: Pubkey,
        local_eid: u32,
    ) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.admin = admin;
        store.endpoint_program = endpoint_program;
        store.local_eid = local_eid;
        store.outbound_nonce = 0;
        store.bump = ctx.bumps.store;

        let lz_receive_types_accounts = &mut ctx.accounts.lz_receive_types_accounts;
        lz_receive_types_accounts.store = ctx.accounts.store.key();
        lz_receive_types_accounts.alt = Pubkey::default();
        lz_receive_types_accounts.bump = ctx.bumps.lz_receive_types_accounts;

        if endpoint_program != crate::ID {
            let bump_seed = [ctx.bumps.store];
            let signer_seeds: &[&[u8]] = &[STORE_SEED, &bump_seed];
            endpoint_register_oapp(
                endpoint_program,
                ctx.accounts.store.key(),
                ctx.remaining_accounts,
                signer_seeds,
                RegisterOAppParams { delegate: admin },
            )?;
        }

        Ok(())
    }

    pub fn set_trusted_peer(
        ctx: Context<SetTrustedPeer>,
        source_eid: u32,
        peer_address: [u8; 32],
    ) -> Result<()> {
        let peer = &mut ctx.accounts.peer;
        peer.source_eid = source_eid;
        peer.peer_address = peer_address;
        peer.bump = ctx.bumps.peer;
        Ok(())
    }

    pub fn set_outbound_peer(
        ctx: Context<SetOutboundPeer>,
        dst_eid: u32,
        peer_address: [u8; 32],
    ) -> Result<()> {
        let peer = &mut ctx.accounts.outbound_peer;
        peer.dst_eid = dst_eid;
        peer.peer_address = peer_address;
        peer.bump = ctx.bumps.outbound_peer;
        Ok(())
    }

    pub fn send_to_gen_layer(
        ctx: Context<SendToGenLayer>,
        params: SendToGenLayerParams,
    ) -> Result<()> {
        require!(
            params.payload.len() <= MAX_PAYLOAD_LEN,
            BridgeEndpointError::PayloadTooLarge
        );
        require!(params.target != [0u8; 32], BridgeEndpointError::TargetZero);

        let store_key = ctx.accounts.store.key();
        let source_sender = ctx.accounts.payer.key().to_bytes();
        let next_nonce = ctx
            .accounts
            .store
            .outbound_nonce
            .checked_add(1)
            .ok_or(BridgeEndpointError::NonceOverflow)?;
        let message_id = outbound_message_id(
            ctx.accounts.store.local_eid,
            &store_key,
            &source_sender,
            &params.target,
            &params.payload,
            next_nonce,
        );
        let message = encode_bridge_envelope(
            message_id,
            ctx.accounts.store.local_eid,
            source_sender,
            params.target,
            &params.payload,
        );

        if ctx.accounts.store.endpoint_program != crate::ID {
            validate_endpoint_account(
                ctx.accounts.store.endpoint_program,
                ctx.accounts.endpoint.key(),
            )?;

            let send_params = SendParams {
                dst_eid: params.dst_eid,
                receiver: ctx.accounts.outbound_peer.peer_address,
                message,
                options: params.options.clone(),
                native_fee: params.native_fee,
                lz_token_fee: params.lz_token_fee,
            };
            let bump_seed = [ctx.accounts.store.bump];
            let signer_seeds: &[&[u8]] = &[STORE_SEED, &bump_seed];
            endpoint_send(
                ctx.accounts.store.endpoint_program,
                store_key,
                ctx.remaining_accounts,
                signer_seeds,
                send_params,
            )?;
        }

        ctx.accounts.store.outbound_nonce = next_nonce;

        emit!(MessageSentToGenLayer {
            message_id,
            dst_eid: params.dst_eid,
            source_eid: ctx.accounts.store.local_eid,
            source_sender,
            target: params.target,
            payload: params.payload,
            nonce: next_nonce,
        });

        Ok(())
    }

    pub fn quote_send_to_gen_layer(
        ctx: Context<QuoteSendToGenLayer>,
        params: QuoteSendToGenLayerParams,
    ) -> Result<MessagingFee> {
        require!(
            params.payload.len() <= MAX_PAYLOAD_LEN,
            BridgeEndpointError::PayloadTooLarge
        );
        require!(params.target != [0u8; 32], BridgeEndpointError::TargetZero);

        let source_sender = ctx.accounts.payer.key().to_bytes();
        let message = encode_bridge_envelope(
            [0u8; 32],
            ctx.accounts.store.local_eid,
            source_sender,
            params.target,
            &params.payload,
        );

        if ctx.accounts.store.endpoint_program == crate::ID {
            return Ok(MessagingFee::default());
        }

        validate_endpoint_account(
            ctx.accounts.store.endpoint_program,
            ctx.accounts.endpoint.key(),
        )?;
        endpoint_quote(
            ctx.accounts.store.endpoint_program,
            ctx.remaining_accounts,
            QuoteParams {
                sender: ctx.accounts.store.key(),
                dst_eid: params.dst_eid,
                receiver: ctx.accounts.outbound_peer.peer_address,
                message,
                options: params.options,
                pay_in_lz_token: params.pay_in_lz_token,
            },
        )
    }

    pub fn register_receiver(
        ctx: Context<RegisterReceiver>,
        target: Pubkey,
        mode: u8,
    ) -> Result<()> {
        require!(
            mode == RECEIVER_MODE_STORE_AND_CLAIM || mode == RECEIVER_MODE_DIRECT,
            BridgeEndpointError::InvalidReceiverMode
        );

        let receiver = &mut ctx.accounts.receiver;
        receiver.target = target;
        receiver.mode = mode;
        receiver.bump = ctx.bumps.receiver;
        let receiver_state = &mut ctx.accounts.receiver_state;
        if receiver_state.target == Pubkey::default() {
            receiver_state.target = target;
            receiver_state.bump = ctx.bumps.receiver_state;
        }
        Ok(())
    }

    pub fn lz_receive(ctx: Context<LzReceive>, params: LzReceiveParams) -> Result<()> {
        let target = ctx.accounts.receiver.target;
        let decoded = validate_layerzero_inbound(&params, target, &ctx.accounts.peer)?;
        require!(
            decoded.payload.len() <= MAX_PAYLOAD_LEN,
            BridgeEndpointError::PayloadTooLarge
        );

        let (expected_message, message_bump) =
            Pubkey::find_program_address(&[MESSAGE_SEED, &decoded.message_id], ctx.program_id);
        require!(
            ctx.accounts.message.key() == expected_message,
            BridgeEndpointError::MessageIdMismatch
        );

        let (expected_status, _) = Pubkey::find_program_address(
            &[MESSAGE_STATUS_SEED, &decoded.message_id],
            ctx.program_id,
        );
        require!(
            ctx.accounts.status.key() == expected_status,
            BridgeEndpointError::MessageIdMismatch
        );

        if ctx.accounts.store.endpoint_program != crate::ID {
            let bump_seed = [ctx.accounts.store.bump];
            let signer_seeds: &[&[u8]] = &[STORE_SEED, &bump_seed];
            endpoint_clear(
                ctx.accounts.store.endpoint_program,
                ctx.accounts.store.key(),
                ctx.remaining_accounts,
                signer_seeds,
                ClearParams {
                    receiver: ctx.accounts.store.key(),
                    src_eid: params.src_eid,
                    sender: params.sender,
                    nonce: params.nonce,
                    guid: params.guid,
                    message: params.message.clone(),
                },
            )?;
        }

        if ctx.accounts.receiver.mode == RECEIVER_MODE_DIRECT {
            apply_to_receiver(
                &mut ctx.accounts.receiver_state,
                target,
                decoded.message_id,
                decoded.source_eid,
                decoded.source_sender,
                decoded.payload,
                ctx.bumps.receiver_state,
            )?;

            emit!(DirectMessageDelivered {
                message_id: decoded.message_id,
                source_eid: decoded.source_eid,
                source_sender: decoded.source_sender,
                target,
            });
        } else {
            let message_info = ctx.accounts.message.as_ref();
            let payer_info = ctx.accounts.payer.to_account_info();
            let system_program_info = ctx.accounts.system_program.to_account_info();
            let message_bump_seed = [message_bump];
            let message_signer_seeds: &[&[u8]] =
                &[MESSAGE_SEED, &decoded.message_id, &message_bump_seed];

            ensure_pda_account(
                &message_info,
                &payer_info,
                &system_program_info,
                ctx.program_id,
                8 + ReceivedMessage::INIT_SPACE,
                message_signer_seeds,
            )?;

            let mut message = deserialize_anchor_account::<ReceivedMessage>(&message_info)?;
            require!(!message.initialized, BridgeEndpointError::AlreadyReceived);

            message.initialized = true;
            message.message_id = decoded.message_id;
            message.source_eid = decoded.source_eid;
            message.source_sender = decoded.source_sender;
            message.target = target;
            message.payload = decoded.payload;
            message.claimed = false;
            message.bump = message_bump;
            serialize_anchor_account(&message_info, &message)?;

            emit!(MessageStored {
                message_id: decoded.message_id,
                source_eid: decoded.source_eid,
                source_sender: decoded.source_sender,
                target,
            });
        }

        Ok(())
    }

    pub fn lz_receive_store(
        ctx: Context<LzReceiveStore>,
        source_eid: u32,
        target: Pubkey,
        message_id: [u8; 32],
        encoded_message: Vec<u8>,
    ) -> Result<()> {
        let decoded = validate_inbound(
            source_eid,
            target,
            message_id,
            &encoded_message,
            &ctx.accounts.peer,
        )?;
        require!(
            ctx.accounts.receiver.mode == RECEIVER_MODE_STORE_AND_CLAIM,
            BridgeEndpointError::ReceiverModeMismatch
        );
        require!(
            decoded.payload.len() <= MAX_PAYLOAD_LEN,
            BridgeEndpointError::PayloadTooLarge
        );

        let message = &mut ctx.accounts.message;
        message.initialized = true;
        message.message_id = decoded.message_id;
        message.source_eid = decoded.source_eid;
        message.source_sender = decoded.source_sender;
        message.target = target;
        message.payload = decoded.payload;
        message.claimed = false;
        message.bump = ctx.bumps.message;

        emit!(MessageStored {
            message_id,
            source_eid,
            source_sender: decoded.source_sender,
            target,
        });

        Ok(())
    }

    pub fn lz_receive_direct(
        ctx: Context<LzReceiveDirect>,
        source_eid: u32,
        target: Pubkey,
        message_id: [u8; 32],
        encoded_message: Vec<u8>,
    ) -> Result<()> {
        let decoded = validate_inbound(
            source_eid,
            target,
            message_id,
            &encoded_message,
            &ctx.accounts.peer,
        )?;
        require!(
            ctx.accounts.receiver.mode == RECEIVER_MODE_DIRECT,
            BridgeEndpointError::ReceiverModeMismatch
        );
        require!(
            decoded.payload.len() <= MAX_PAYLOAD_LEN,
            BridgeEndpointError::PayloadTooLarge
        );

        let status = &mut ctx.accounts.status;
        status.message_id = message_id;
        status.delivered = true;
        status.bump = ctx.bumps.status;

        apply_to_receiver(
            &mut ctx.accounts.receiver_state,
            target,
            decoded.message_id,
            decoded.source_eid,
            decoded.source_sender,
            decoded.payload,
            ctx.bumps.receiver_state,
        )?;

        emit!(DirectMessageDelivered {
            message_id,
            source_eid,
            source_sender: decoded.source_sender,
            target,
        });

        Ok(())
    }

    pub fn claim_message(ctx: Context<ClaimMessage>, message_id: [u8; 32]) -> Result<()> {
        require!(
            ctx.accounts.receiver.mode == RECEIVER_MODE_STORE_AND_CLAIM,
            BridgeEndpointError::ReceiverModeMismatch
        );
        require!(
            !ctx.accounts.message.claimed,
            BridgeEndpointError::AlreadyClaimed
        );

        let message = &mut ctx.accounts.message;
        message.claimed = true;

        apply_to_receiver(
            &mut ctx.accounts.receiver_state,
            message.target,
            message.message_id,
            message.source_eid,
            message.source_sender,
            message.payload.clone(),
            ctx.bumps.receiver_state,
        )?;

        emit!(MessageClaimed {
            message_id,
            target: message.target,
        });

        Ok(())
    }

    pub fn lz_receive_types_info(
        ctx: Context<LzReceiveTypesInfo>,
        params: LzReceiveParams,
    ) -> Result<(u8, LzReceiveTypesV2Accounts)> {
        let decoded = decode_bridge_envelope(&params.message)?;
        let (receiver, _) =
            Pubkey::find_program_address(&[RECEIVER_SEED, &decoded.target], ctx.program_id);

        let accounts = if ctx.accounts.lz_receive_types_accounts.alt == Pubkey::default() {
            vec![ctx.accounts.lz_receive_types_accounts.store, receiver]
        } else {
            vec![
                ctx.accounts.lz_receive_types_accounts.store,
                receiver,
                ctx.accounts.lz_receive_types_accounts.alt,
            ]
        };

        Ok((
            LZ_RECEIVE_TYPES_VERSION,
            LzReceiveTypesV2Accounts { accounts },
        ))
    }

    pub fn lz_receive_types_v2(
        ctx: Context<LzReceiveTypesV2>,
        params: LzReceiveParams,
    ) -> Result<LzReceiveTypesV2Result> {
        let decoded = decode_bridge_envelope(&params.message)?;
        let target = Pubkey::new_from_array(decoded.target);
        require!(
            ctx.accounts.receiver.target == target,
            BridgeEndpointError::TargetMismatch
        );

        let store_key = ctx.accounts.store.key();
        let (peer, _) = Pubkey::find_program_address(
            &[PEER_SEED, store_key.as_ref(), &params.src_eid.to_be_bytes()],
            ctx.program_id,
        );
        let (receiver, _) =
            Pubkey::find_program_address(&[RECEIVER_SEED, target.as_ref()], ctx.program_id);
        let (message, _) =
            Pubkey::find_program_address(&[MESSAGE_SEED, &decoded.message_id], ctx.program_id);
        let (status, _) = Pubkey::find_program_address(
            &[MESSAGE_STATUS_SEED, &decoded.message_id],
            ctx.program_id,
        );
        let (receiver_state, _) =
            Pubkey::find_program_address(&[RECEIVER_STATE_SEED, target.as_ref()], ctx.program_id);

        let mut accounts = vec![
            AccountMetaRef {
                pubkey: AddressLocator::Payer,
                is_writable: true,
            },
            AccountMetaRef {
                pubkey: store_key.into(),
                is_writable: false,
            },
            AccountMetaRef {
                pubkey: peer.into(),
                is_writable: false,
            },
            AccountMetaRef {
                pubkey: receiver.into(),
                is_writable: false,
            },
            AccountMetaRef {
                pubkey: message.into(),
                is_writable: true,
            },
            AccountMetaRef {
                pubkey: status.into(),
                is_writable: true,
            },
            AccountMetaRef {
                pubkey: receiver_state.into(),
                is_writable: true,
            },
            AccountMetaRef {
                pubkey: anchor_lang::system_program::ID.into(),
                is_writable: false,
            },
        ];

        accounts.extend(get_accounts_for_clear(
            ctx.accounts.store.endpoint_program,
            &store_key,
            params.src_eid,
            &params.sender,
            params.nonce,
        ));

        Ok(LzReceiveTypesV2Result {
            context_version: EXECUTION_CONTEXT_VERSION_1,
            alts: ctx
                .remaining_accounts
                .iter()
                .map(|account| account.key())
                .collect(),
            instructions: vec![Instruction::LzReceive { accounts }],
        })
    }
}

#[derive(Accounts)]
pub struct Init<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Store::INIT_SPACE,
        seeds = [STORE_SEED],
        bump
    )]
    pub store: Account<'info, Store>,
    #[account(
        init,
        payer = payer,
        space = 8 + LzReceiveTypesAccountsState::INIT_SPACE,
        seeds = [LZ_RECEIVE_TYPES_SEED, store.key().as_ref()],
        bump
    )]
    pub lz_receive_types_accounts: Account<'info, LzReceiveTypesAccountsState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(source_eid: u32)]
pub struct SetTrustedPeer<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [STORE_SEED], bump = store.bump, has_one = admin)]
    pub store: Account<'info, Store>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + PeerConfig::INIT_SPACE,
        seeds = [PEER_SEED, store.key().as_ref(), &source_eid.to_be_bytes()],
        bump
    )]
    pub peer: Account<'info, PeerConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(dst_eid: u32)]
pub struct SetOutboundPeer<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [STORE_SEED], bump = store.bump, has_one = admin)]
    pub store: Account<'info, Store>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + OutboundPeerConfig::INIT_SPACE,
        seeds = [OUTBOUND_PEER_SEED, store.key().as_ref(), &dst_eid.to_be_bytes()],
        bump
    )]
    pub outbound_peer: Account<'info, OutboundPeerConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: SendToGenLayerParams)]
pub struct SendToGenLayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(
        seeds = [OUTBOUND_PEER_SEED, store.key().as_ref(), &params.dst_eid.to_be_bytes()],
        bump = outbound_peer.bump
    )]
    pub outbound_peer: Account<'info, OutboundPeerConfig>,
    /// CHECK: The handler validates this PDA against the configured LayerZero Endpoint program before CPI.
    pub endpoint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(params: QuoteSendToGenLayerParams)]
pub struct QuoteSendToGenLayer<'info> {
    pub payer: Signer<'info>,
    #[account(seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(
        seeds = [OUTBOUND_PEER_SEED, store.key().as_ref(), &params.dst_eid.to_be_bytes()],
        bump = outbound_peer.bump
    )]
    pub outbound_peer: Account<'info, OutboundPeerConfig>,
    /// CHECK: The handler validates this PDA against the configured LayerZero Endpoint program before CPI.
    pub endpoint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(target: Pubkey)]
pub struct RegisterReceiver<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [STORE_SEED], bump = store.bump, has_one = admin)]
    pub store: Account<'info, Store>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + ReceiverConfig::INIT_SPACE,
        seeds = [RECEIVER_SEED, target.as_ref()],
        bump
    )]
    pub receiver: Account<'info, ReceiverConfig>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + ReceiverState::INIT_SPACE,
        seeds = [RECEIVER_STATE_SEED, target.as_ref()],
        bump
    )]
    pub receiver_state: Account<'info, ReceiverState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceive<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(
        seeds = [PEER_SEED, store.key().as_ref(), &params.src_eid.to_be_bytes()],
        bump = peer.bump
    )]
    pub peer: Account<'info, PeerConfig>,
    #[account(
        seeds = [RECEIVER_SEED, receiver.target.as_ref()],
        bump = receiver.bump
    )]
    pub receiver: Account<'info, ReceiverConfig>,
    /// CHECK: The handler derives this PDA from the decoded bridge message ID and initializes it when needed.
    #[account(mut)]
    pub message: UncheckedAccount<'info>,
    /// CHECK: The handler derives this PDA from the decoded bridge message ID and initializes it when needed.
    #[account(mut)]
    pub status: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + ReceiverState::INIT_SPACE,
        seeds = [RECEIVER_STATE_SEED, receiver.target.as_ref()],
        bump
    )]
    pub receiver_state: Account<'info, ReceiverState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(source_eid: u32, target: Pubkey, message_id: [u8; 32])]
pub struct LzReceiveStore<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(
        seeds = [PEER_SEED, store.key().as_ref(), &source_eid.to_be_bytes()],
        bump = peer.bump
    )]
    pub peer: Account<'info, PeerConfig>,
    #[account(
        seeds = [RECEIVER_SEED, target.as_ref()],
        bump = receiver.bump,
        constraint = receiver.target == target
    )]
    pub receiver: Account<'info, ReceiverConfig>,
    #[account(
        init,
        payer = payer,
        space = 8 + ReceivedMessage::INIT_SPACE,
        seeds = [MESSAGE_SEED, &message_id],
        bump
    )]
    pub message: Account<'info, ReceivedMessage>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(source_eid: u32, target: Pubkey, message_id: [u8; 32])]
pub struct LzReceiveDirect<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(
        seeds = [PEER_SEED, store.key().as_ref(), &source_eid.to_be_bytes()],
        bump = peer.bump
    )]
    pub peer: Account<'info, PeerConfig>,
    #[account(
        seeds = [RECEIVER_SEED, target.as_ref()],
        bump = receiver.bump,
        constraint = receiver.target == target
    )]
    pub receiver: Account<'info, ReceiverConfig>,
    #[account(
        init,
        payer = payer,
        space = 8 + MessageStatus::INIT_SPACE,
        seeds = [MESSAGE_STATUS_SEED, &message_id],
        bump
    )]
    pub status: Account<'info, MessageStatus>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + ReceiverState::INIT_SPACE,
        seeds = [RECEIVER_STATE_SEED, target.as_ref()],
        bump
    )]
    pub receiver_state: Account<'info, ReceiverState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(message_id: [u8; 32])]
pub struct ClaimMessage<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    #[account(seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(
        seeds = [RECEIVER_SEED, message.target.as_ref()],
        bump = receiver.bump,
        constraint = receiver.target == message.target
    )]
    pub receiver: Account<'info, ReceiverConfig>,
    #[account(
        mut,
        seeds = [MESSAGE_SEED, &message_id],
        bump = message.bump
    )]
    pub message: Account<'info, ReceivedMessage>,
    #[account(
        init_if_needed,
        payer = claimer,
        space = 8 + ReceiverState::INIT_SPACE,
        seeds = [RECEIVER_STATE_SEED, message.target.as_ref()],
        bump
    )]
    pub receiver_state: Account<'info, ReceiverState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LzReceiveTypesInfo<'info> {
    #[account(seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(
        seeds = [LZ_RECEIVE_TYPES_SEED, store.key().as_ref()],
        bump = lz_receive_types_accounts.bump
    )]
    pub lz_receive_types_accounts: Account<'info, LzReceiveTypesAccountsState>,
}

#[derive(Accounts)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceiveTypesV2<'info> {
    #[account(seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    pub receiver: Account<'info, ReceiverConfig>,
}

#[account]
#[derive(InitSpace)]
pub struct Store {
    pub admin: Pubkey,
    pub bump: u8,
    pub endpoint_program: Pubkey,
    pub local_eid: u32,
    pub outbound_nonce: u64,
}

#[account]
#[derive(InitSpace)]
pub struct LzReceiveTypesAccountsState {
    pub store: Pubkey,
    pub alt: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PeerConfig {
    pub source_eid: u32,
    pub peer_address: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OutboundPeerConfig {
    pub dst_eid: u32,
    pub peer_address: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReceiverConfig {
    pub target: Pubkey,
    pub mode: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReceivedMessage {
    pub initialized: bool,
    pub message_id: [u8; 32],
    pub source_eid: u32,
    pub source_sender: [u8; 32],
    pub target: Pubkey,
    #[max_len(MAX_PAYLOAD_LEN)]
    pub payload: Vec<u8>,
    pub claimed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MessageStatus {
    pub message_id: [u8; 32],
    pub delivered: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReceiverState {
    pub target: Pubkey,
    pub last_message_id: [u8; 32],
    pub last_source_eid: u32,
    pub last_source_sender: [u8; 32],
    #[max_len(MAX_PAYLOAD_LEN)]
    pub last_payload: Vec<u8>,
    pub bump: u8,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SendToGenLayerParams {
    pub dst_eid: u32,
    pub target: [u8; 32],
    pub payload: Vec<u8>,
    pub options: Vec<u8>,
    pub native_fee: u64,
    pub lz_token_fee: u64,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct QuoteSendToGenLayerParams {
    pub dst_eid: u32,
    pub target: [u8; 32],
    pub payload: Vec<u8>,
    pub options: Vec<u8>,
    pub pay_in_lz_token: bool,
}

#[event]
pub struct MessageStored {
    pub message_id: [u8; 32],
    pub source_eid: u32,
    pub source_sender: [u8; 32],
    pub target: Pubkey,
}

#[event]
pub struct MessageClaimed {
    pub message_id: [u8; 32],
    pub target: Pubkey,
}

#[event]
pub struct DirectMessageDelivered {
    pub message_id: [u8; 32],
    pub source_eid: u32,
    pub source_sender: [u8; 32],
    pub target: Pubkey,
}

#[event]
pub struct MessageSentToGenLayer {
    pub message_id: [u8; 32],
    pub dst_eid: u32,
    pub source_eid: u32,
    pub source_sender: [u8; 32],
    pub target: [u8; 32],
    pub payload: Vec<u8>,
    pub nonce: u64,
}

#[error_code]
pub enum BridgeEndpointError {
    #[msg("The bridge envelope source EID does not match the LayerZero source EID")]
    SourceEidMismatch,
    #[msg("The bridge envelope target does not match the Solana receiver")]
    TargetMismatch,
    #[msg("The bridge envelope message ID does not match the account seed")]
    MessageIdMismatch,
    #[msg("The message sender is not trusted for the source EID")]
    UntrustedPeer,
    #[msg("The bridge payload is too large")]
    PayloadTooLarge,
    #[msg("The receiver mode is invalid")]
    InvalidReceiverMode,
    #[msg("The registered receiver mode does not match the receive path")]
    ReceiverModeMismatch,
    #[msg("The message has already been claimed")]
    AlreadyClaimed,
    #[msg("The message has already been received")]
    AlreadyReceived,
    #[msg("The supplied PDA account is not valid for bridge message state")]
    InvalidPdaAccount,
    #[msg("The outbound target is zero")]
    TargetZero,
    #[msg("The outbound nonce overflowed")]
    NonceOverflow,
    #[msg("The supplied LayerZero Endpoint account is invalid")]
    InvalidEndpointAccount,
}

fn outbound_message_id(
    local_eid: u32,
    store: &Pubkey,
    source_sender: &[u8; 32],
    target: &[u8; 32],
    payload: &[u8],
    nonce: u64,
) -> [u8; 32] {
    solana_keccak_hasher::hashv(&[
        &local_eid.to_be_bytes(),
        store.as_ref(),
        source_sender,
        target,
        payload,
        &nonce.to_be_bytes(),
    ])
    .to_bytes()
}

fn validate_endpoint_account(endpoint_program: Pubkey, endpoint: Pubkey) -> Result<()> {
    let (expected_endpoint, _) = Pubkey::find_program_address(&[ENDPOINT_SEED], &endpoint_program);
    require!(
        endpoint == expected_endpoint,
        BridgeEndpointError::InvalidEndpointAccount
    );
    Ok(())
}

fn validate_inbound(
    source_eid: u32,
    target: Pubkey,
    message_id: [u8; 32],
    encoded_message: &[u8],
    peer: &PeerConfig,
) -> Result<msg_codec::BridgeMessage> {
    let decoded = decode_bridge_envelope(encoded_message)?;
    require!(
        decoded.source_eid == source_eid,
        BridgeEndpointError::SourceEidMismatch
    );
    require!(
        decoded.message_id == message_id,
        BridgeEndpointError::MessageIdMismatch
    );
    require!(
        Pubkey::new_from_array(decoded.target) == target,
        BridgeEndpointError::TargetMismatch
    );
    require!(
        decoded.source_sender == peer.peer_address && decoded.source_eid == peer.source_eid,
        BridgeEndpointError::UntrustedPeer
    );
    Ok(decoded)
}

fn validate_layerzero_inbound(
    params: &LzReceiveParams,
    target: Pubkey,
    peer: &PeerConfig,
) -> Result<msg_codec::BridgeMessage> {
    let decoded = decode_bridge_envelope(&params.message)?;
    require!(
        Pubkey::new_from_array(decoded.target) == target,
        BridgeEndpointError::TargetMismatch
    );
    require!(
        params.sender == peer.peer_address && params.src_eid == peer.source_eid,
        BridgeEndpointError::UntrustedPeer
    );
    Ok(decoded)
}

fn apply_to_receiver(
    receiver_state: &mut Account<ReceiverState>,
    target: Pubkey,
    message_id: [u8; 32],
    source_eid: u32,
    source_sender: [u8; 32],
    payload: Vec<u8>,
    bump: u8,
) -> Result<()> {
    require!(
        payload.len() <= MAX_PAYLOAD_LEN,
        BridgeEndpointError::PayloadTooLarge
    );
    receiver_state.target = target;
    receiver_state.last_message_id = message_id;
    receiver_state.last_source_eid = source_eid;
    receiver_state.last_source_sender = source_sender;
    receiver_state.last_payload = payload;
    receiver_state.bump = bump;
    Ok(())
}

fn ensure_pda_account<'info>(
    account: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    program_id: &Pubkey,
    space: usize,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    if account.owner == program_id {
        return Ok(());
    }

    require!(
        account.data_is_empty(),
        BridgeEndpointError::InvalidPdaAccount
    );

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space);
    let create_account = system_instruction::create_account(
        payer.key,
        account.key,
        lamports,
        space as u64,
        program_id,
    );

    invoke_signed(
        &create_account,
        &[payer.clone(), account.clone(), system_program.clone()],
        &[signer_seeds],
    )?;

    Ok(())
}

fn has_discriminator<T: Discriminator>(account: &AccountInfo) -> Result<bool> {
    let data = account.try_borrow_data()?;
    let discriminator = T::DISCRIMINATOR;
    Ok(data.len() >= discriminator.len() && &data[..discriminator.len()] == discriminator)
}

fn deserialize_anchor_account<T>(account: &AccountInfo) -> Result<T>
where
    T: AccountDeserialize + Discriminator,
{
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;

    if has_discriminator::<T>(account)? {
        T::try_deserialize(&mut data_slice)
    } else {
        T::try_deserialize_unchecked(&mut data_slice)
    }
}

fn serialize_anchor_account<T>(account: &AccountInfo, value: &T) -> Result<()>
where
    T: AccountSerialize,
{
    let mut data = account.try_borrow_mut_data()?;
    let mut data_slice: &mut [u8] = &mut data[..];
    value.try_serialize(&mut data_slice)
}
