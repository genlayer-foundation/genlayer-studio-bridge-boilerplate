use anchor_lang::prelude::error_code;

pub const BRIDGE_ENVELOPE_VERSION: u16 = 1;
pub const BRIDGE_ENVELOPE_HEAD_WORDS: usize = 6;
pub const WORD_SIZE: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BridgeMessage {
    pub version: u16,
    pub message_id: [u8; 32],
    pub source_eid: u32,
    pub source_sender: [u8; 32],
    pub target: [u8; 32],
    pub payload: Vec<u8>,
}

#[error_code]
#[derive(PartialEq, Eq)]
pub enum DecodeError {
    #[msg("Bridge envelope is shorter than the ABI head")]
    TooShort,
    #[msg("Bridge envelope version is not supported")]
    BadVersion,
    #[msg("Bridge envelope payload offset is invalid")]
    InvalidOffset,
    #[msg("Bridge envelope payload length is invalid")]
    InvalidLength,
    #[msg("Bridge envelope payload padding is non-zero")]
    NonZeroPadding,
}

pub fn encode_bridge_envelope(
    message_id: [u8; 32],
    source_eid: u32,
    source_sender: [u8; 32],
    target: [u8; 32],
    payload: &[u8],
) -> Vec<u8> {
    let payload_offset = BRIDGE_ENVELOPE_HEAD_WORDS * WORD_SIZE;
    let payload_padding = (WORD_SIZE - payload.len() % WORD_SIZE) % WORD_SIZE;
    let mut out = Vec::with_capacity(payload_offset + WORD_SIZE + payload.len() + payload_padding);

    out.extend(word_from_u16(BRIDGE_ENVELOPE_VERSION));
    out.extend(message_id);
    out.extend(word_from_u32(source_eid));
    out.extend(source_sender);
    out.extend(target);
    out.extend(word_from_u64(payload_offset as u64));
    out.extend(word_from_u64(payload.len() as u64));
    out.extend(payload);
    out.extend(vec![0u8; payload_padding]);
    out
}

pub fn decode_bridge_envelope(input: &[u8]) -> Result<BridgeMessage, DecodeError> {
    let head_len = BRIDGE_ENVELOPE_HEAD_WORDS * WORD_SIZE;
    if input.len() < head_len {
        return Err(DecodeError::TooShort);
    }

    let version = read_u16_word(word(input, 0)?);
    if version != BRIDGE_ENVELOPE_VERSION {
        return Err(DecodeError::BadVersion);
    }

    let message_id = read_bytes32(word(input, 1)?);
    let source_eid = read_u32_word(word(input, 2)?);
    let source_sender = read_bytes32(word(input, 3)?);
    let target = read_bytes32(word(input, 4)?);
    let payload_offset = read_usize_word(word(input, 5)?)?;

    if payload_offset < head_len || payload_offset % WORD_SIZE != 0 {
        return Err(DecodeError::InvalidOffset);
    }
    if input.len() < payload_offset + WORD_SIZE {
        return Err(DecodeError::InvalidLength);
    }

    let payload_len = read_usize_word(&input[payload_offset..payload_offset + WORD_SIZE])?;
    let payload_start = payload_offset + WORD_SIZE;
    let payload_end = payload_start
        .checked_add(payload_len)
        .ok_or(DecodeError::InvalidLength)?;
    if input.len() < payload_end {
        return Err(DecodeError::InvalidLength);
    }

    let padded_end = payload_start
        .checked_add(round_up_32(payload_len).ok_or(DecodeError::InvalidLength)?)
        .ok_or(DecodeError::InvalidLength)?;
    if input.len() < padded_end {
        return Err(DecodeError::InvalidLength);
    }
    if input[payload_end..padded_end].iter().any(|byte| *byte != 0) {
        return Err(DecodeError::NonZeroPadding);
    }

    Ok(BridgeMessage {
        version,
        message_id,
        source_eid,
        source_sender,
        target,
        payload: input[payload_start..payload_end].to_vec(),
    })
}

fn word(input: &[u8], index: usize) -> Result<&[u8], DecodeError> {
    let start = index * WORD_SIZE;
    let end = start + WORD_SIZE;
    input.get(start..end).ok_or(DecodeError::TooShort)
}

fn read_bytes32(input: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(input);
    out
}

fn read_u16_word(input: &[u8]) -> u16 {
    u16::from_be_bytes([input[30], input[31]])
}

fn read_u32_word(input: &[u8]) -> u32 {
    u32::from_be_bytes([input[28], input[29], input[30], input[31]])
}

fn read_usize_word(input: &[u8]) -> Result<usize, DecodeError> {
    if input[..24].iter().any(|byte| *byte != 0) {
        return Err(DecodeError::InvalidLength);
    }
    let value = u64::from_be_bytes(input[24..32].try_into().expect("word suffix"));
    usize::try_from(value).map_err(|_| DecodeError::InvalidLength)
}

fn round_up_32(value: usize) -> Option<usize> {
    value.checked_add(31).map(|v| v / 32 * 32)
}

fn word_from_u16(value: u16) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[30..32].copy_from_slice(&value.to_be_bytes());
    word
}

fn word_from_u32(value: u32) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[28..32].copy_from_slice(&value.to_be_bytes());
    word
}

fn word_from_u64(value: u64) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[24..32].copy_from_slice(&value.to_be_bytes());
    word
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn encode_fixture(payload: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend(word_from_u16(BRIDGE_ENVELOPE_VERSION));
        out.extend([0x11; 32]);
        out.extend(word_from_u32(61_998));
        out.extend([0x22; 32]);
        out.extend([0x33; 32]);
        out.extend(word_from_u64(192));
        out.extend(word_from_u64(payload.len() as u64));
        out.extend(payload);
        out.extend(vec![0u8; (32 - payload.len() % 32) % 32]);
        out
    }

    #[test]
    fn decodes_canonical_bridge_envelope() {
        let payload = b"hello solana";
        let encoded = encode_fixture(payload);
        let decoded = decode_bridge_envelope(&encoded).expect("decode");

        assert_eq!(decoded.version, BRIDGE_ENVELOPE_VERSION);
        assert_eq!(decoded.message_id, [0x11; 32]);
        assert_eq!(decoded.source_eid, 61_998);
        assert_eq!(decoded.source_sender, [0x22; 32]);
        assert_eq!(decoded.target, [0x33; 32]);
        assert_eq!(decoded.payload, payload);
    }

    #[test]
    fn rejects_bad_version() {
        let mut encoded = encode_fixture(b"payload");
        encoded[31] = 2;
        assert_eq!(
            decode_bridge_envelope(&encoded),
            Err(DecodeError::BadVersion)
        );
    }

    #[test]
    fn rejects_non_zero_padding() {
        let mut encoded = encode_fixture(b"payload");
        let last = encoded.len() - 1;
        encoded[last] = 1;
        assert_eq!(
            decode_bridge_envelope(&encoded),
            Err(DecodeError::NonZeroPadding)
        );
    }

    #[test]
    fn decodes_canonical_bridge_envelope_golden_vector() {
        let vector: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../../test-vectors/bridge-envelope.json"
        )))
        .expect("golden vector json");
        let encoded = hex_to_bytes(vector["encoded"].as_str().expect("encoded"));
        let decoded = decode_bridge_envelope(&encoded).expect("decode");

        assert_eq!(
            decoded.version,
            vector["version"].as_u64().expect("version") as u16
        );
        assert_eq!(
            decoded.message_id,
            hex_to_bytes32(vector["messageId"].as_str().expect("messageId"))
        );
        assert_eq!(
            decoded.source_eid,
            vector["srcEid"].as_u64().expect("srcEid") as u32
        );
        assert_eq!(
            decoded.source_sender,
            hex_to_bytes32(vector["srcSender"].as_str().expect("srcSender"))
        );
        assert_eq!(
            decoded.target,
            hex_to_bytes32(vector["target"].as_str().expect("target"))
        );
        assert_eq!(
            decoded.payload,
            hex_to_bytes(vector["payload"].as_str().expect("payload"))
        );
    }

    #[test]
    fn encodes_canonical_bridge_envelope_golden_vector() {
        let vector: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../../test-vectors/bridge-envelope.json"
        )))
        .expect("golden vector json");
        let encoded = encode_bridge_envelope(
            hex_to_bytes32(vector["messageId"].as_str().expect("messageId")),
            vector["srcEid"].as_u64().expect("srcEid") as u32,
            hex_to_bytes32(vector["srcSender"].as_str().expect("srcSender")),
            hex_to_bytes32(vector["target"].as_str().expect("target")),
            &hex_to_bytes(vector["payload"].as_str().expect("payload")),
        );

        assert_eq!(
            encoded,
            hex_to_bytes(vector["encoded"].as_str().expect("encoded"))
        );
    }

    fn hex_to_bytes32(value: &str) -> [u8; 32] {
        let bytes = hex_to_bytes(value);
        let mut out = [0u8; 32];
        out.copy_from_slice(&bytes);
        out
    }

    fn hex_to_bytes(value: &str) -> Vec<u8> {
        let hex = value.strip_prefix("0x").unwrap_or(value);
        assert_eq!(hex.len() % 2, 0);
        (0..hex.len())
            .step_by(2)
            .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).expect("hex byte"))
            .collect()
    }
}
