-- Drop legacy platform RSA keypair table (keys live in walt.id + optional GXDCH PEM env / filesystem per ADR-002).
DROP TABLE IF EXISTS "platform_keypairs";
