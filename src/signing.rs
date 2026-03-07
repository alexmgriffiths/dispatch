use rsa::pkcs1v15::SigningKey;
use rsa::sha2::Sha256;
use rsa::signature::{SignatureEncoding, Signer};
use rsa::RsaPrivateKey;
use std::path::Path;

pub async fn load_private_key(path: &str) -> Result<RsaPrivateKey, Box<dyn std::error::Error>> {
    let pem = tokio::fs::read_to_string(Path::new(path)).await?;
    let key = <RsaPrivateKey as rsa::pkcs8::DecodePrivateKey>::from_pkcs8_pem(&pem)?;
    Ok(key)
}

pub fn sign_rsa_sha256(data: &str, private_key: &RsaPrivateKey) -> String {
    let signing_key = SigningKey::<Sha256>::new(private_key.clone());
    let signature = signing_key.sign(data.as_bytes());
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(signature.to_bytes())
}

pub fn format_signature(sig: &str) -> String {
    format!("sig=:{}:, keyid=\"main\"", sig)
}
