# Auth proxy source manual acceptance

Status: `PENDING_HUMAN`

This repository verifies the trust boundary with in-memory request fixtures.
It does not claim that a real Cloudflare proxy or Cloudflare Tunnel emits the
configured source header and hop chain for the deployed topology.

## Required deployment checks

- Confirm the direct peer address seen by Auth is in the explicitly configured
  `trustedProxyCidrs` range.
- Confirm the selected header and exact `trustedHops` value match the actual
  proxy chain. Do not enable a bare boolean trust flag.
- Send a request containing spoofed `Forwarded`, `X-Forwarded-For`, and
  `CF-Connecting-IP` values from an untrusted direct peer; Auth must keep the
  direct source fingerprint.
- Send a request through the real Cloudflare/Tunnel path and compare only the
  expected source fingerprint behavior and rate-limit bucket behavior. Do not
  record raw headers, account names, cookies, or tokens.
- Confirm restart clears in-memory login buckets and that the configured
  window/TTL and capacity diagnostics remain bounded.

## Evidence to record

- Environment and deployment date:
- Proxy/Tunnel product and version:
- Auth configuration rule name, header, hop count, and CIDR count:
- Direct-peer trust result:
- Spoofed-header rejection result:
- Trusted-path source result:
- Restart/window/LRU result:
- Reviewer and evidence location:

No production database, account, supplier, or content data is required for
this acceptance.
