# Security Policy

## Reporting a Vulnerability

Found a (suspected) security vulnerability? In order of preference:

1. **[GitHub private vulnerability reporting](https://github.com/MinBZK/par-dpia-form/security/advisories/new)**,
   for findings in this code. Only the maintainers of this repository see your
   report.
2. **NCSC Coordinated Vulnerability Disclosure**, for the running service, or
   if you cannot reach the team through GitHub:
   * Nederlands: **[NCSC Kwetsbaarheid melden](https://www.ncsc.nl/producten-en-diensten/kwetsbaarheid-melden-cvd)**
   * English: **[NCSC report vulnerability](https://www.ncsc.nl/en/cvd-report-form)**

A suspicion is welcome too; we would rather look into a false alarm than miss
a real vulnerability. Please do not disclose a finding publicly until we have
had a chance to respond.

## What to expect

* We respond to every report.
* We take mitigating measures as soon as possible, prioritised by risk.

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS (Common Vulnerability Scoring System) v4.0 Rating:

| CVSS v4.0 | Supported Versions                        |
| --------- | ----------------------------------------- |
| 9.0-10.0  | Releases within the previous months       |
| 4.0-8.9   | Most recent release                       |

## Known non-findings

The endpoints below are publicly reachable **by design**. Automated scanners
regularly flag them; they are not vulnerabilities, and you do not need to report
them.

| Endpoint | Why it is public |
| -------- | ---------------- |
| `/config.json` | Runtime configuration for the frontend: the OIDC issuer URL, the realm, and the *public* client id (per [RFC 6749 §2.1](https://www.rfc-editor.org/rfc/rfc6749#section-2.1) a public client has no secret). The same values are published by Keycloak itself at `/realms/<realm>/.well-known/openid-configuration` and are visible in every login redirect. A CI guard (`pnpm check:config`) fails the build if any key other than these public values is added. |
| `/version.json` | Application version and commit SHA, deliberately exposed so support questions can be tied to a build. |
| `/api/health` | Liveness endpoint for the deployment platform. |
| `/zonder-account/` | The standalone invulhulp runs entirely client-side and is meant to be usable without an account. |
| Keycloak realm and client id | Public parameters of the OIDC protocol, see `/config.json` above. |
| `/.well-known/security.txt` flagged `not_signed` by a validator | Deliberate: a PGP signature would require managing and publishing our own key, and would conflict with computing `Expires` at build time (a signature covers the exact bytes of the file). Its core claim, that NCSC is the reporting point, is independently verifiable in NCSC's own signed file at [https://www.ncsc.nl/.well-known/security.txt](https://www.ncsc.nl/.well-known/security.txt), which states exactly that; a signature on our own file just is not that trust anchor. |

Findings that *are* in scope include anything that lets one user reach another
user's projects, assessments or comments, bypasses authentication, injects
script into a page, or exposes a credential.
