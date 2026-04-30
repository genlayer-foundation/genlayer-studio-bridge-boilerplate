use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction as SolanaInstruction},
        program::{get_return_data, invoke, invoke_signed},
    },
};

pub const EXECUTION_CONTEXT_VERSION_1: u8 = 1;
pub const LZ_RECEIVE_TYPES_VERSION: u8 = 2;

pub const ENDPOINT_SEED: &[u8] = b"Endpoint";
const NONCE_SEED: &[u8] = b"Nonce";
const OAPP_SEED: &[u8] = b"OApp";
const PAYLOAD_HASH_SEED: &[u8] = b"PayloadHash";
const EVENT_SEED: &[u8] = b"__event_authority";

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct LzReceiveParams {
    pub src_eid: u32,
    pub sender: [u8; 32],
    pub nonce: u64,
    pub guid: [u8; 32],
    pub message: Vec<u8>,
    pub extra_data: Vec<u8>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Default)]
pub struct MessagingFee {
    pub native_fee: u64,
    pub lz_token_fee: u64,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Default)]
pub struct MessagingReceipt {
    pub guid: [u8; 32],
    pub nonce: u64,
    pub fee: MessagingFee,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SendParams {
    pub dst_eid: u32,
    pub receiver: [u8; 32],
    pub message: Vec<u8>,
    pub options: Vec<u8>,
    pub native_fee: u64,
    pub lz_token_fee: u64,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct QuoteParams {
    pub sender: Pubkey,
    pub dst_eid: u32,
    pub receiver: [u8; 32],
    pub message: Vec<u8>,
    pub options: Vec<u8>,
    pub pay_in_lz_token: bool,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RegisterOAppParams {
    pub delegate: Pubkey,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ClearParams {
    pub receiver: Pubkey,
    pub src_eid: u32,
    pub sender: [u8; 32],
    pub nonce: u64,
    pub guid: [u8; 32],
    pub message: Vec<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AddressLocator {
    Address(Pubkey),
    AltIndex(u8, u8),
    Payer,
    Signer(u8),
    Context,
}

impl From<Pubkey> for AddressLocator {
    fn from(pubkey: Pubkey) -> Self {
        AddressLocator::Address(pubkey)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AccountMetaRef {
    pub pubkey: AddressLocator,
    pub is_writable: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LzReceiveTypesV2Accounts {
    pub accounts: Vec<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LzReceiveTypesV2Result {
    pub context_version: u8,
    pub alts: Vec<Pubkey>,
    pub instructions: Vec<Instruction>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Instruction {
    LzReceive {
        accounts: Vec<AccountMetaRef>,
    },
    Standard {
        program_id: Pubkey,
        accounts: Vec<AccountMetaRef>,
        data: Vec<u8>,
    },
}

pub fn get_accounts_for_clear(
    endpoint_program: Pubkey,
    receiver: &Pubkey,
    src_eid: u32,
    sender: &[u8; 32],
    nonce: u64,
) -> Vec<AccountMetaRef> {
    let (nonce_account, _) = Pubkey::find_program_address(
        &[
            NONCE_SEED,
            &receiver.to_bytes(),
            &src_eid.to_be_bytes(),
            sender,
        ],
        &endpoint_program,
    );

    let (payload_hash_account, _) = Pubkey::find_program_address(
        &[
            PAYLOAD_HASH_SEED,
            &receiver.to_bytes(),
            &src_eid.to_be_bytes(),
            sender,
            &nonce.to_be_bytes(),
        ],
        &endpoint_program,
    );

    let (oapp_registry_account, _) =
        Pubkey::find_program_address(&[OAPP_SEED, &receiver.to_bytes()], &endpoint_program);
    let (event_authority_account, _) =
        Pubkey::find_program_address(&[EVENT_SEED], &endpoint_program);
    let (endpoint_settings_account, _) =
        Pubkey::find_program_address(&[ENDPOINT_SEED], &endpoint_program);

    vec![
        AccountMetaRef {
            pubkey: endpoint_program.into(),
            is_writable: false,
        },
        AccountMetaRef {
            pubkey: (*receiver).into(),
            is_writable: false,
        },
        AccountMetaRef {
            pubkey: oapp_registry_account.into(),
            is_writable: false,
        },
        AccountMetaRef {
            pubkey: nonce_account.into(),
            is_writable: false,
        },
        AccountMetaRef {
            pubkey: payload_hash_account.into(),
            is_writable: true,
        },
        AccountMetaRef {
            pubkey: endpoint_settings_account.into(),
            is_writable: true,
        },
        AccountMetaRef {
            pubkey: event_authority_account.into(),
            is_writable: false,
        },
        AccountMetaRef {
            pubkey: endpoint_program.into(),
            is_writable: false,
        },
    ]
}

pub fn endpoint_clear<'info>(
    endpoint_program: Pubkey,
    receiver: Pubkey,
    accounts: &[AccountInfo<'info>],
    signer_seeds: &[&[u8]],
    params: ClearParams,
) -> Result<()> {
    validate_endpoint_cpi_accounts(endpoint_program, accounts)?;
    require!(accounts.len() >= 8, ErrorCode::AccountNotEnoughKeys);
    require!(accounts[1].key() == receiver, ErrorCode::ConstraintAddress);

    let ix = SolanaInstruction {
        program_id: endpoint_program,
        accounts: endpoint_account_metas(accounts, Some(receiver)),
        data: endpoint_instruction_data("clear", &params),
    };

    invoke_signed(&ix, accounts, &[signer_seeds])?;
    Ok(())
}

pub fn endpoint_send<'info>(
    endpoint_program: Pubkey,
    sender: Pubkey,
    accounts: &[AccountInfo<'info>],
    signer_seeds: &[&[u8]],
    params: SendParams,
) -> Result<MessagingReceipt> {
    validate_endpoint_cpi_accounts(endpoint_program, accounts)?;
    require!(accounts.len() >= 2, ErrorCode::AccountNotEnoughKeys);
    require!(accounts[1].key() == sender, ErrorCode::ConstraintAddress);
    require!(
        accounts
            .iter()
            .filter(|account| account.key() == sender)
            .count()
            == 1,
        ErrorCode::ConstraintAddress
    );

    let ix = SolanaInstruction {
        program_id: endpoint_program,
        accounts: endpoint_account_metas(accounts, Some(sender)),
        data: endpoint_instruction_data("send", &params),
    };

    invoke_signed(&ix, accounts, &[signer_seeds])?;
    read_endpoint_return_data(endpoint_program)
}

pub fn endpoint_quote<'info>(
    endpoint_program: Pubkey,
    accounts: &[AccountInfo<'info>],
    params: QuoteParams,
) -> Result<MessagingFee> {
    validate_endpoint_cpi_accounts(endpoint_program, accounts)?;

    let ix = SolanaInstruction {
        program_id: endpoint_program,
        accounts: endpoint_account_metas(accounts, None),
        data: endpoint_instruction_data("quote", &params),
    };

    invoke(&ix, accounts)?;
    read_endpoint_return_data(endpoint_program)
}

pub fn endpoint_register_oapp<'info>(
    endpoint_program: Pubkey,
    oapp: Pubkey,
    accounts: &[AccountInfo<'info>],
    signer_seeds: &[&[u8]],
    params: RegisterOAppParams,
) -> Result<()> {
    validate_endpoint_cpi_accounts(endpoint_program, accounts)?;
    require!(accounts.len() >= 3, ErrorCode::AccountNotEnoughKeys);
    require!(accounts[2].key() == oapp, ErrorCode::ConstraintAddress);

    let ix = SolanaInstruction {
        program_id: endpoint_program,
        accounts: endpoint_account_metas(accounts, Some(oapp)),
        data: endpoint_instruction_data("register_oapp", &params),
    };

    invoke_signed(&ix, accounts, &[signer_seeds])?;
    Ok(())
}

fn validate_endpoint_cpi_accounts(
    endpoint_program: Pubkey,
    accounts: &[AccountInfo],
) -> Result<()> {
    require!(!accounts.is_empty(), ErrorCode::AccountNotEnoughKeys);
    require!(
        accounts[0].key() == endpoint_program,
        ErrorCode::InvalidProgramId
    );
    Ok(())
}

fn endpoint_account_metas(accounts: &[AccountInfo], signer: Option<Pubkey>) -> Vec<AccountMeta> {
    accounts
        .iter()
        .skip(1)
        .map(|account| {
            let is_signer =
                account.is_signer || signer.map(|key| key == account.key()).unwrap_or(false);
            if account.is_writable {
                AccountMeta::new(account.key(), is_signer)
            } else {
                AccountMeta::new_readonly(account.key(), is_signer)
            }
        })
        .collect()
}

fn endpoint_instruction_data<T: AnchorSerialize>(name: &str, params: &T) -> Vec<u8> {
    let mut data = anchor_discriminator(name).to_vec();
    params
        .serialize(&mut data)
        .expect("serializing LayerZero Endpoint parameters into Vec cannot fail");
    data
}

fn anchor_discriminator(name: &str) -> [u8; 8] {
    let mut preimage = b"global:".to_vec();
    preimage.extend_from_slice(name.as_bytes());
    let digest = solana_sha256_hasher::hash(&preimage).to_bytes();
    let mut discriminator = [0u8; 8];
    discriminator.copy_from_slice(&digest[..8]);
    discriminator
}

fn read_endpoint_return_data<T: AnchorDeserialize>(endpoint_program: Pubkey) -> Result<T> {
    let (return_program, data) = get_return_data().ok_or(ErrorCode::AccountDidNotSerialize)?;
    require!(
        return_program == endpoint_program,
        ErrorCode::InvalidProgramId
    );
    T::try_from_slice(&data).map_err(|_| ErrorCode::AccountDidNotDeserialize.into())
}
