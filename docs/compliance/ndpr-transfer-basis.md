# NDPR Data Transfer Basis

**Status:** Draft — requires review by counsel before launch  
**Date:** 2026-04-17

## Background

FrenzPay processes personal data of Nigerian users (BVN, NIN, residential address, KYC documents). This data is stored on Hetzner servers located in **Germany (EU)**.

Under the **Nigeria Data Protection Regulation (NDPR) 2019** and the **Nigeria Data Protection Act (NDPA) 2023**, cross-border transfers of Nigerian personal data require a lawful basis.

## Transfer Details

| Data Category | Destination | Processor |
|---------------|-------------|-----------|
| KYC PII (BVN, NIN, address) | Hetzner Germany (EU) | Frenz LLC (self-hosted) |
| KYC documents (ID scans) | Hetzner Germany (EU) | Frenz LLC (self-hosted) |
| Transaction data | Hetzner Germany (EU) | Frenz LLC (self-hosted) |
| BVN verification | Dojah (Nigeria/US) | Dojah Technologies |
| Identity documents | Dojah (Nigeria/US) | Dojah Technologies |

## Lawful Basis for Transfer

1. **Contractual necessity** (NDPA Section 25(1)(b)): Processing is necessary for the performance of the contract between FrenzPay and the user (payment services).

2. **User consent** (NDPA Section 25(1)(a)): Users explicitly consent to cross-border data transfer at signup via the Privacy Policy and Terms of Service.

3. **Adequacy** (NDPA Section 43): The EU has comprehensive data protection legislation (GDPR) deemed adequate. Standard Contractual Clauses (SCCs) equivalent measures apply.

## Data Subject Rights

Under NDPR/NDPA, Nigerian users have:
- Right to access their data
- Right to correction
- Right to deletion (subject to MSB retention obligations: 5 years)
- Right to data portability (provided via `/dashboard/settings` → Export my data)
- Right to object to processing

## Data Minimisation

- Only data necessary for KYC verification and compliance is collected
- PII is encrypted at rest (AES-256-GCM envelope encryption — see ADR 0002)
- Access to plaintext PII requires KMS access (Infisical, separate server)

## Retention

| Data Type | Retention | Basis |
|-----------|-----------|-------|
| Transaction records | 7 years | FinCEN MSB requirement |
| KYC documents | 5 years after account closure | NDPR / AML regulations |
| Login/audit logs | 2 years | Security monitoring |
| Account data | Duration of relationship + 5 years | Legal/compliance |

## TODO Before Launch

- [ ] Data Processing Agreement (DPA) executed with Dojah
- [ ] DPA executed with Hetzner (existing EU standard contract)
- [ ] Privacy Policy reviewed by Nigerian data protection counsel
- [ ] NDPC registration completed (NDPA Section 27 — data processors must register)
- [ ] Privacy Impact Assessment (PIA) completed for KYC flow
