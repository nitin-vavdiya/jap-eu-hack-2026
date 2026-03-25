<p align="center">
  <img src="https://img.shields.io/badge/EU--Japan%20Hackathon-2026-blueviolet?style=for-the-badge" alt="EU-Japan Hackathon 2026"/>
  <img src="https://img.shields.io/badge/Dataspaces-Interoperability-blue?style=for-the-badge" alt="Dataspaces"/>
  <img src="https://img.shields.io/badge/W3C-Verifiable%20Credentials-green?style=for-the-badge" alt="W3C VC"/>
  <img src="https://img.shields.io/badge/Gaia--X-Compliant-orange?style=for-the-badge" alt="Gaia-X"/>
  <img src="https://img.shields.io/badge/did%3Aweb-Self--Sovereign-brightgreen?style=for-the-badge" alt="did:web"/>
</p>

# Universal Dataspace Interoperability Gateway

### _One gateway. Every dataspace. Trusted everywhere._

> A platform that lets companies in different countries and industries share data securely — without rebuilding their existing systems. Demonstrated through a real-world cross-border vehicle insurance scenario between Europe and Japan.

---

## The Problem

Businesses in Europe and Japan cannot easily share data with each other. Not because they don't want to — but because their digital infrastructure speaks completely different languages:

- **Europe** uses EDC (Eclipse Dataspace Connector) + Gaia-X trust framework
- **Japan** uses CADDE + JASPAR data standards
- **India** and other regions have their own emerging standards

A Japanese insurer cannot verify a European car's history. A European manufacturer cannot share vehicle data with a Japanese partner without custom-built integrations that cost millions and take months.

> **The result:** Cross-border data sharing is slow, expensive, and full of trust gaps.

---

## The Solution

The **Universal Dataspace Interoperability Gateway** is a **translator and trust bridge** between different dataspace ecosystems.

Think of it like an international airport — planes from every country land, transfer, and depart, without each airline needing to rebuild the entire airport for themselves.

```
┌──────────────┐                                      ┌──────────────┐
│  Europe       │                                      │  Japan        │
│  EDC + Gaia-X │ ◄──── Universal Gateway ────►  │  CADDE        │
│  ODRL + VC    │    (Translate · Trust · Route)       │  JASPAR + VC  │
└──────────────┘                                      └──────────────┘
```

**The gateway does four things:**

| What | How | Business Value |
|------|-----|----------------|
| **Discovers** endpoints | Resolves digital identity documents (DIDs) to find where data lives | No phone calls or emails to ask "what's your API URL?" |
| **Translates** protocols | Converts between EDC and CADDE data-sharing protocols | No custom integration per partner |
| **Transforms** formats | Converts EU vehicle data (DPP) to Japanese insurance standard (JASPAR) | No manual data re-entry |
| **Enforces** trust | Verifies every participant's identity and consent before sharing anything | No unauthorized data access |

---

## Live Demo: Cross-Border Vehicle Insurance

We demonstrate the complete gateway with one real-world scenario: **a Japanese insurance company wants to underwrite a policy for a European-manufactured car.**

### The People in the Story

| Person / Company    | Role                          |
| ------------------- | ----------------------------- |
| **TATA Motors**     | European car manufacturer — owns and provides vehicle data |
| **Digit Insurance** | Japanese insurer — wants to assess the car's risk to price a policy |
| **Mario Sanchez**   | Car owner — must approve any sharing of his vehicle's data |

### What Happens, Step by Step

```
 Step 1   TATA Motors registers on the platform
          → Gets a verified digital identity (Gaia-X compliance)
          → Gets a data-sharing endpoint (EDC connector)

 Step 2   TATA registers Mario's vehicle
          → Vehicle history published as a Digital Product Passport (DPP)

 Step 3   Mario buys the car
          → Ownership credential issued to his digital wallet

 Step 4   Digit Insurance requests a quote for Mario's car (enters VIN)
          → Platform sends Mario a consent request

 Step 5   Mario approves in his wallet
          → Platform finds TATA's data endpoint automatically (via DID)

 Step 6   Secure 7-step data negotiation between Digit and TATA's systems
          → Contract agreed, data access granted under ODRL policy

 Step 7   Vehicle data fetched from TATA's system
          → Automatically converted from EU format (DPP) to Japanese format (JASPAR)

 Step 8   9-factor risk scoring engine runs
          → Score calculated (0–100 points)

 Step 9   Insurance package recommended with exact premium
          → Policy credential issued to Mario's wallet
```

**Total time: 30–60 seconds, fully automated, zero manual intervention.**

---

## What Makes This Different

### 1. Every Company Gets a Real Digital Identity — Automatically

When a company registers on the platform, it instantly gets a **W3C-standard digital identity** (`did:web`) that:
- Is **publicly resolvable** by any compliant system worldwide
- **Passes Gaia-X compliance** — the EU's trust framework for data spaces
- **Automatically includes its data-sharing endpoint** once its connector is live
- Is **company-specific** — not shared with anyone else

> No manual setup. No IT tickets. No waiting. Register → identity live in seconds.

### 2. Gaia-X Compliance Is Fully Automated

Traditionally, getting Gaia-X compliance requires manual paperwork, IT setup, and weeks of back-and-forth. On this platform:

1. Company fills in a registration form (legal name, VAT ID, address)
2. Platform automatically builds and signs the required credentials **in the company's name**
3. Sends them to the Gaia-X compliance authority (GXDCH)
4. Compliance credential returned — issued directly to the company's own digital identity

> From form submission to Gaia-X verified: minutes, not months.

### 3. Data Endpoints Are Discovered, Not Configured

When Digit Insurance wants TATA's vehicle data, nobody types a URL or calls an IT department. The platform:
1. Reads the car's manufacturer credential
2. Resolves TATA's digital identity document
3. Finds the exact data endpoint listed inside it
4. Connects automatically

> It works like DNS for the internet — but for trusted data sharing.

### 4. Consent Is Non-Negotiable

No data moves without the owner's explicit approval. Mario must:
- Receive a clear description of who is asking, what they want, and why
- Actively approve in his wallet
- All access expires after 1 hour automatically

> Data sovereignty is built into every transaction — not bolted on afterwards.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        6 Web Portals (browser-based)                    │
│                                                                         │
│  Dataspace    Manufacturer  Showroom    Wallet    Insurance    Company   │
│  Registry     Admin         Marketplace           Underwriting Directory │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                  ┌─────────────▼──────────────┐
                  │       Central API Server    │
                  │    (business logic + DB)    │
                  └──┬────┬────┬────┬────┬──────┘
                     │    │    │    │    │
           ┌─────────┘    │    │    │    └───────────────┐
           ▼              ▼    ▼    ▼                    ▼
     Identity &       Wallet  Gaia-X  Data Connector   Japan
     Access Mgmt      (VC/VP) Trust   (EDC / CADDE)    Bridge
     (Keycloak)       (walt.id) (GXDCH)  (Tractus-X)   (CADDE)
```

### The 4 Layers of the Gateway

| Layer | Business Purpose | What It Does Technically |
|-------|-----------------|--------------------------|
| **Discovery** | Find any partner's data endpoint automatically | Resolves `did:web` identity documents; DSP URLs auto-published after connector setup |
| **Protocol Translation** | Connect EU and Japanese systems without rebuilding either | Bridges EDC ↔ CADDE negotiation protocols |
| **Data Transformation** | Speak each partner's data language | Converts EU Digital Product Passport → Japanese JASPAR (24 fields, 7 categories) |
| **Trust Enforcement** | Ensure only verified, consenting parties exchange data | Gaia-X compliance VCs + OpenID4VP verification + consent gates + time-limited access |

---

## Company Onboarding Journey

```
① Register company (name, VAT ID, address, contact)
        ↓
② Platform assigns a unique digital identity:
   did:web:platform-domain:company:your-company-id
        ↓
③ Gaia-X compliance check runs automatically
   (notary verification → SHACL compliance → credential issued)
        ↓
④ Company is now a verified Gaia-X participant
        ↓
⑤ EDC data connector provisioned automatically
        ↓
⑥ Connector endpoint published in company's identity document
   (any partner can now discover and connect — no manual config)
        ↓
⑦ Company is ready to share and receive data across dataspaces
```

---

## Dynamic Insurance Underwriting Engine

### How Vehicle Data Becomes an Insurance Quote

The platform automatically converts the EU standard vehicle history (Digital Product Passport) into the Japanese insurance format (JASPAR):

| EU Vehicle Data | → | Japanese Insurance Format |
|----------------|---|--------------------------|
| Mileage (km) | → | Odometer reading |
| Motor type | → | Powertrain classification |
| CO₂ emissions | → | Sustainability metrics |
| Damage history | → | Risk indicators |
| Type approval | → | Regulatory compliance |
| Ownership chain | → | Provenance record |
| Service history | → | Maintenance log |

**24 data fields mapped automatically** with quality tracking — the system tells you exactly how complete the data is and flags any missing critical fields.

### Risk Scoring (100-Point Scale)

| Factor | Max Score | What It Measures |
|--------|-----------|-----------------|
| Vehicle Age | 15 | Newer = lower risk |
| Safety Rating | 15 | NCAP star rating |
| Regulatory Compliance | 10 | Type approval, roadworthiness |
| Powertrain & Battery | 10 | EV battery health, motor type |
| Sustainability | 5 | Emissions, energy label |
| Ownership Confidence | 15 | Single owner, verified credentials |
| Mileage & Usage | 15 | Lower mileage = lower wear |
| Damage History | 10 | Incidents, repairs |
| Data Completeness | 5 | Quality of available data |

### Insurance Packages by Risk Score

| Score  | Package          | Typical Annual Premium | Coverage Level |
| ------ | ---------------- | ---------------------- | -------------- |
| 85–100 | **Premium Plus** | €800 – €1,050          | Full comprehensive, zero excess, worldwide |
| 70–84  | **Premium**      | €950 – €1,250          | Full comprehensive, low excess |
| 55–69  | **Standard**     | €1,150 – €1,550        | Comprehensive, standard excess |
| 40–54  | **Basic Plus**   | €1,400 – €1,900        | Third-party, fire & theft |
| 0–39   | **Basic**        | €1,800 – €2,500        | Third-party only (manual review) |

EV owners get automatic add-on options: charging cable theft, home charger insurance, battery warranty extension.

---

## Trust & Security — Plain Language

| What We Protect | How | Why It Matters |
|----------------|-----|----------------|
| **Company identity** | Every company gets a unique, verifiable digital identity (Gaia-X certified) | You always know exactly who you're dealing with |
| **Data ownership** | Car owners must explicitly approve every data request | Owners stay in control — GDPR compliant by design |
| **Access expiry** | All data access expires after 1 hour | No "set and forget" data leaks |
| **Credential integrity** | All credentials cryptographically signed (RSA-2048) | Credentials cannot be forged or tampered with |
| **Signing keys** | Platform's signing key stored in database — survives restarts | Consistency across deployments and updates |
| **Policy enforcement** | Data usage policies (ODRL) enforced before any transfer | Providers control exactly how their data is used |

---

## Who Can Use This

The gateway is **industry-agnostic**. The same platform works for any cross-border data sharing scenario:

| Industry | Data Provider | Data Consumer | What Gets Shared |
| -------- | ------------- | ------------- | ---------------- |
| **Automotive** | Car manufacturer (EU) | Insurer (Japan) | Vehicle history, DPP |
| **Healthcare** | Hospital (EU) | Research institute (JP) | Anonymised patient records |
| **Supply Chain** | Manufacturer | Customs authority | Origin certificates, shipment data |
| **Energy** | Grid operator | Carbon auditor | Production data, emissions |
| **Finance** | Bank (EU) | Regulator (JP) | Compliance reports, transaction data |

> Change the data format, keep the gateway.

---

## Key Numbers

| Metric | Value |
|--------|-------|
| End-to-end insurance quote time | 30–60 seconds |
| Data fields transformed (DPP → JASPAR) | 24 fields across 7 categories |
| Risk scoring factors | 9 factors, 100-point scale |
| Steps in EDC data negotiation | 7 steps (fully automated) |
| Steps in VP verification pipeline | 11 steps |
| Data access session lifetime | 1 hour (auto-expires) |
| Database models | 15+ |
| Web portals | 6 |

---

## Future Roadmap

| Milestone | What It Unlocks |
|-----------|----------------|
| **Multi-region mesh** | Connect EU + Japan + India + ASEAN through a single federated gateway |
| **EBSI / eIDAS integration** | Cross-border legal identity recognised under EU law |
| **AI-powered underwriting** | ML models trained on real historical underwriting data |
| **Catena-X alignment** | Native support for automotive battery passport and traceability |
| **Zero-knowledge proofs** | Prove a car meets criteria without revealing the raw data |
| **Per-company keypairs** | True self-sovereign keys — platform holds nothing on behalf of companies |

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ / npm 10+
- [ngrok](https://ngrok.com) free account — required so Gaia-X can verify your company's digital identity document

### Quick Start

```bash
git clone https://github.com/smartSenseSolutions/jap-eu-hack-2026.git
cd jap-eu-hack-2026
npm install
cp backend/.env.example backend/.env
docker compose up -d
```

### Enable Gaia-X Compliance Locally

For Gaia-X to verify company identities, the backend needs a public URL. Use ngrok:

```bash
# In a separate terminal:
ngrok http 8000

# Copy the URL shown (e.g. https://abc123.ngrok-free.app)
# Add to backend/.env:
GAIAX_DID_DOMAIN=abc123.ngrok-free.app
APP_BASE_URL=https://abc123.ngrok-free.app

# Restart backend
npm run dev --prefix backend
```

### Access the Portals

| Portal             | URL                   | Who Uses It         |
| ------------------ | --------------------- | ------------------- |
| Dataspace Registry | http://localhost:3001 | Organization admin  |
| TATA Admin         | http://localhost:3002 | Fleet management    |
| Public Showroom    | http://localhost:3003 | Vehicle marketplace |
| Wallet             | http://localhost:3004 | Credential holder   |
| Insurance          | http://localhost:3005 | Underwriting agent  |
| Company Directory  | http://localhost:3006 | Company admin       |

---

## Documentation

| Document                                                       | Description                            |
| -------------------------------------------------------------- | -------------------------------------- |
| [Architecture](docs/architecture.md)                           | System design & component interactions |
| [Backend API](docs/backend.md)                                 | API reference & service documentation  |
| [Frontend Portals](docs/frontend.md)                           | Portal breakdown & shared packages     |
| [Database Schema](docs/database.md)                            | 15+ models & relationships             |
| [DevOps](docs/devops.md)                                       | Docker, Helm & Kubernetes deployment   |
| [Vehicle Purchase Flow](docs/flows/vehicle-purchase.md)        | Purchase → OwnershipVC issuance        |
| [Insurance Verification](docs/flows/insurance-verification.md) | 11-step OpenID4VP pipeline             |
| [EDC Negotiation](docs/flows/edc-negotiation.md)               | 7-step sovereign data exchange         |
| [Gaia-X Compliance](docs/flows/gaiax-compliance.md)            | Organization verification              |
| [Consent Access](docs/flows/consent-access.md)                 | Consent-gated data sharing             |

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

<p align="center">
  <strong>Built for the EU-Japan Hackathon 2026</strong><br/>
  by <a href="https://smartsensesolutions.com">SmartSense Solutions</a>
</p>
