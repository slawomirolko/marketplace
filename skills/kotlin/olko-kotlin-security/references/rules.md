# Kotlin security rules

Apply these rules to changed lines only. Read code outside the scope only to get evidence. Report each violation with its rule id.

## S - Security

- **S1** - Validate input at the boundary; reject bad input early. Do not trust client-side validation alone.
- **S2** - Store secrets in environment variables or the Android keystore; never commit secrets or provide default values for secret config keys.
- **S3** - Use HTTPS in production; restrict cleartext traffic to local dev only.
- **S4** - Never log sensitive data (tokens, credentials, PII).
