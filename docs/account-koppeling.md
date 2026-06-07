# Account-koppeling en identiteit

Hoe een Keycloak-login wordt gekoppeld aan een lokale gebruiker in de
boekhouding-backend (`apps/boekhouding-backend/src/middleware/auth.ts`).

## Identiteit = Keycloak `sub`

Een lokale `users`-rij wordt geïdentificeerd door het Keycloak-subject
(`oidc_sub`). Dat is de stabiele, unieke identifier per Keycloak-account.
E-mail is **veranderbare metadata** — niet de identiteit — maar is in het
huidige datamodel wél `unique`, omdat de uitnodig-functie op e-mail leunt
(zie hieronder).

Bij elke login:

1. Zoek de gebruiker op `oidc_sub`. Gevonden → ingelogd (e-mail/naam worden
   gesynct). **Bestaande gebruikers worden dus altijd op `sub` herkend en
   raken hun projecten nooit kwijt door deze logica.**
2. Niet gevonden (eerste login voor dit subject) → zie "Eerste login".

## Uitnodigen per e-mail (waarom e-mail uniek is)

Een eigenaar kan een collega per **e-mailadres** aan een project toevoegen
vóórdat die ooit heeft ingelogd. Daarvoor maakt `routes/members.ts` een
**placeholder-rij** aan: een `users`-rij met het e-mailadres en `oidc_sub =
NULL`. Bij de eerste login van die persoon wordt de placeholder geclaimd
(de `oidc_sub` wordt ingevuld).

## Veiligheidsregels bij eerste login

- **Claim alleen een onbeheerde placeholder.** De placeholder wordt geclaimd
  via `UPDATE ... WHERE email = ? AND oidc_sub IS NULL` (atomair). Een rij die
  al aan een ander subject is gekoppeld wordt **nooit** overschreven.
- **Geen account-takeover.** Bestaat er al een *gekoppeld* account met dit
  e-mailadres, dan wordt niet herkoppeld maar **409** geretourneerd. Zo kan een
  token met een ander subject maar hetzelfde e-mailadres niet stilzwijgend
  andermans account (incl. projecten/DPIA-data) overnemen.
- **Geen lockout bij e-mail-sync.** Wijzigt het e-mailadres van een bestaande
  gebruiker in Keycloak naar één die een andere rij al heeft, dan wordt het
  e-mailadres **niet** gesynct (de oude waarde blijft staan, er wordt gelogd) —
  de gebruiker blijft inloggen i.p.v. een unique-constraint-fout te krijgen.

## E-mailverificatie (`email_verified`)

Keycloak levert de standaard OIDC-claim `email_verified` in het token. We
**dwingen die bewust niet af**:

- SSO Rijk levert in de praktijk al een geverifieerd e-mailadres.
- Onvoorwaardelijk afdwingen zou gebruikers buitensluiten bij IdP's die de
  claim weglaten.
- Daarom is er geen ongebruikte config/gate voor in de code (eerder wel
  overwogen, weer verwijderd om geen dode code mee te dragen).

**Heroverweeg** dit als er een auth-pad bijkomt náást SSO Rijk (lokale
Keycloak-accounts, self-registration, een tweede broker) waar e-mail niet
gegarandeerd uniek/geverifieerd is — of bij een toekomstige invitations-flow
(zie #335), waar het claimen van een uitnodiging idealiter `email_verified` vereist.

> De bron-IdP (bijv. "komt van SSO Rijk") is **niet** uit de standaardclaims af
> te leiden. Dat zou een Keycloak protocol-mapper vergen die bijv. een `idp`-
> claim toevoegt.

## Bekende randgevallen

- **`sub`-wijziging** (realm-migratie, account opnieuw aangemaakt, her-
  federatie): zelfde persoon, zelfde e-mail, nieuw subject → wordt niet op
  `sub` gevonden en de e-mail matcht een gekoppelde rij → **409**. Vereist
  admin-interventie (de `oidc_sub` van de bestaande rij bijwerken). Komt bij
  stabiele SSO-Rijk-accounts niet voor in normaal bedrijf.
- **E-mailhergebruik** (adres van een vertrekkende collega later aan iemand
  anders toegewezen): de nieuwe persoon (nieuw `sub`) erft **niet** het oude
  account → 409 of, bij een niet-botsend e-mailadres, een vers account.

> Een meer account-gebaseerde invite-flow (eerst lookup naar bestaande accounts;
> uitnodigingen los van de gebruikersidentiteit), die deze randgevallen wegneemt,
> staat als verbeterrichting in #335.
