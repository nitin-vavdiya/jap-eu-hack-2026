-- Seed migration: inserts demo data for companies, credentials, cars, wallet, and org_credentials.
-- Uses ON CONFLICT DO UPDATE so it is safe to run multiple times (idempotent).

-- ─── Companies ────────────────────────────────────────────────────────────────

INSERT INTO "companies" ("id", "name", "vatId", "eoriNumber", "cin", "gstNumber", "country", "city", "address", "adminName", "adminEmail", "did", "registeredAt", "createdAt", "updatedAt")
VALUES
  (
    'company-toyota-001',
    'Toyota Motor Corporation',
    'JP-TOYOTA-VAT-2024',
    'JPEORI0012345',
    'JP-0180-01-008234',
    'T1234567890123',
    'JP',
    'Toyota City',
    '1 Toyota-cho, Toyota City, Aichi 471-8571, Japan',
    'Akio Toyoda',
    'admin@toyota-global.com',
    'did:eu-dataspace:company-toyota-001',
    '2024-01-15T09:00:00.000Z',
    NOW(),
    NOW()
  ),
  (
    'company-tokiomarine-001',
    'Tokio Marine & Nichido Fire Insurance Co., Ltd.',
    'JP-TOKIOMARINE-VAT-2024',
    NULL,
    NULL,
    NULL,
    'JP',
    'Tokyo',
    '1-2-1 Marunouchi, Chiyoda-ku, Tokyo 100-0005, Japan',
    'Satoru Komiya',
    'admin@tokiomarine.com',
    'did:eu-dataspace:company-tokiomarine-001',
    '2024-02-01T09:00:00.000Z',
    NOW(),
    NOW()
  )
ON CONFLICT ("id") DO UPDATE SET
  "name"          = EXCLUDED."name",
  "vatId"         = EXCLUDED."vatId",
  "eoriNumber"    = EXCLUDED."eoriNumber",
  "cin"           = EXCLUDED."cin",
  "gstNumber"     = EXCLUDED."gstNumber",
  "country"       = EXCLUDED."country",
  "city"          = EXCLUDED."city",
  "address"       = EXCLUDED."address",
  "adminName"     = EXCLUDED."adminName",
  "adminEmail"    = EXCLUDED."adminEmail",
  "did"           = EXCLUDED."did",
  "registeredAt"  = EXCLUDED."registeredAt",
  "updatedAt"     = NOW();

-- ─── Credentials ──────────────────────────────────────────────────────────────

INSERT INTO "credentials" ("id", "type", "issuerId", "issuerName", "subjectId", "companyId", "issuedAt", "expiresAt", "status", "credentialSubject", "createdAt", "updatedAt")
VALUES
  (
    'cred-org-toyota-001',
    'OrgVC',
    'eu-dataspace',
    'EU APAC Dataspace',
    'company-toyota-001',
    'company-toyota-001',
    '2024-01-15T09:00:00.000Z',
    NULL,
    'active',
    '{"companyName":"Toyota Motor Corporation","companyDid":"did:eu-dataspace:company-toyota-001","registrationNumber":"JP-0180-01-008234","vatId":"JP-TOYOTA-VAT-2024","eoriNumber":"JPEORI0012345","cin":"JP-0180-01-008234","gstNumber":"T1234567890123","country":"JP","city":"Toyota City","address":"1 Toyota-cho, Toyota City, Aichi 471-8571, Japan","adminName":"Akio Toyoda","adminEmail":"admin@toyota-global.com","incorporationDate":"1937-08-28T00:00:00.000Z"}',
    NOW(),
    NOW()
  ),
  (
    'cred-org-tokiomarine-001',
    'OrgVC',
    'eu-dataspace',
    'EU APAC Dataspace',
    'company-tokiomarine-001',
    'company-tokiomarine-001',
    '2024-02-01T09:00:00.000Z',
    NULL,
    'active',
    '{"companyName":"Tokio Marine & Nichido Fire Insurance Co., Ltd.","companyDid":"did:eu-dataspace:company-tokiomarine-001","registrationNumber":"JP-0100-01-078900","vatId":"JP-TOKIOMARINE-VAT-2024","country":"JP","city":"Tokyo","address":"1-2-1 Marunouchi, Chiyoda-ku, Tokyo 100-0005, Japan","adminName":"Satoru Komiya","adminEmail":"admin@tokiomarine.com","incorporationDate":"1879-08-01T00:00:00.000Z","insuranceLicense":"FSA/INS/2024/001","authorizedEUDistributor":true}',
    NOW(),
    NOW()
  ),
  (
    'cred-self-mario-001',
    'SelfVC',
    'smartsense-idp',
    'SmartSense Identity Provider',
    'mario-sanchez',
    NULL,
    '2024-01-10T10:00:00.000Z',
    '2027-01-10T10:00:00.000Z',
    'active',
    '{"name":"Mario Sanchez","email":"mario.sanchez@email.it","nationality":"Italian","dateOfBirth":"1985-06-15","did":"did:smartsense:mario-sanchez"}',
    NOW(),
    NOW()
  )
ON CONFLICT ("id") DO UPDATE SET
  "type"              = EXCLUDED."type",
  "issuerId"          = EXCLUDED."issuerId",
  "issuerName"        = EXCLUDED."issuerName",
  "subjectId"         = EXCLUDED."subjectId",
  "companyId"         = EXCLUDED."companyId",
  "issuedAt"          = EXCLUDED."issuedAt",
  "expiresAt"         = EXCLUDED."expiresAt",
  "status"            = EXCLUDED."status",
  "credentialSubject" = EXCLUDED."credentialSubject",
  "updatedAt"         = NOW();

-- ─── Cars ─────────────────────────────────────────────────────────────────────

INSERT INTO "cars" ("id", "vin", "make", "model", "variant", "year", "color", "price", "status", "mileage", "fuelType", "transmission", "manufacturerCredentialId", "dpp", "createdAt", "updatedAt")
VALUES
  (
    'car-bz4x-ev-001',
    'TOYO2025BZ4XEV001',
    'Toyota',
    'bZ4X',
    'Z Grade AWD',
    2025,
    'Platinum White Pearl',
    6200000,
    'available',
    0,
    'Electric',
    'Automatic',
    'cred-org-toyota-001',
    '{"stateOfHealth":{"batteryHealth":100,"batteryCapacity":"71.4 kWh","range":"559 km","lastInspectionDate":"2025-01-20T10:00:00.000Z"},"damageHistory":{"hasDamage":false,"incidents":[]},"serviceHistory":{"services":[{"date":"2025-01-20T10:00:00.000Z","type":"Pre-delivery Inspection","dealer":"Toyota Aichi Dealer","mileage":5}]},"ownershipChain":{"manufacturer":"Toyota Motor Corporation","manufacturingDate":"2025-01-10T00:00:00.000Z","manufacturingPlant":"Motomachi Plant, Toyota City, Aichi","currentOwner":null},"manufacturerCredential":{"credentialId":"cred-org-toyota-001","legalParticipantId":"org-cred-toyota-001","issuer":"Toyota Motor Corporation","type":"OrgVC","issuedAt":"2024-01-15T09:00:00.000Z","status":"active"}}',
    NOW(),
    NOW()
  ),
  (
    'car-rav4-hybrid-001',
    'TOYO2024RAV4HY001',
    'Toyota',
    'RAV4 Hybrid',
    'G Grade',
    2024,
    'Attitude Black Mica',
    4800000,
    'available',
    8500,
    'Hybrid',
    'CVT',
    'cred-org-toyota-001',
    '{"stateOfHealth":{"engineHealth":98,"batteryHealth":99,"lastInspectionDate":"2024-11-15T10:00:00.000Z"},"damageHistory":{"hasDamage":false,"incidents":[]},"serviceHistory":{"services":[{"date":"2024-02-01T10:00:00.000Z","type":"Pre-delivery Inspection","dealer":"Toyota Tokyo Dealer","mileage":8},{"date":"2024-08-10T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Tokyo Dealer","mileage":5200}]},"ownershipChain":{"manufacturer":"Toyota Motor Corporation","manufacturingDate":"2024-01-20T00:00:00.000Z","manufacturingPlant":"Takaoka Plant, Toyota City, Aichi","owners":[{"name":"Yuki Tanaka","from":"2024-02-05T00:00:00.000Z","to":null}],"currentOwner":"Yuki Tanaka"},"manufacturerCredential":{"credentialId":"cred-org-toyota-001","legalParticipantId":"org-cred-toyota-001","issuer":"Toyota Motor Corporation","type":"OrgVC","issuedAt":"2024-01-15T09:00:00.000Z","status":"active"}}',
    NOW(),
    NOW()
  ),
  (
    'car-camry-hybrid-001',
    'TOYO2023CAMRYHY001',
    'Toyota',
    'Camry Hybrid',
    'WS Grade',
    2023,
    'Emotional Red II',
    4200000,
    'available',
    18000,
    'Hybrid',
    'CVT',
    'cred-org-toyota-001',
    '{"stateOfHealth":{"engineHealth":96,"batteryHealth":97,"lastInspectionDate":"2024-09-20T10:00:00.000Z"},"damageHistory":{"hasDamage":false,"incidents":[]},"serviceHistory":{"services":[{"date":"2023-03-10T10:00:00.000Z","type":"Pre-delivery Inspection","dealer":"Toyota Osaka Dealer","mileage":5},{"date":"2023-09-15T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Osaka Dealer","mileage":8500},{"date":"2024-03-20T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Osaka Dealer","mileage":15200}]},"ownershipChain":{"manufacturer":"Toyota Motor Corporation","manufacturingDate":"2023-02-15T00:00:00.000Z","manufacturingPlant":"Tsutsumi Plant, Toyota City, Aichi","owners":[{"name":"Kenji Yamamoto","from":"2023-03-15T00:00:00.000Z","to":null}],"currentOwner":"Kenji Yamamoto"},"manufacturerCredential":{"credentialId":"cred-org-toyota-001","legalParticipantId":"org-cred-toyota-001","issuer":"Toyota Motor Corporation","type":"OrgVC","issuedAt":"2024-01-15T09:00:00.000Z","status":"active"}}',
    NOW(),
    NOW()
  ),
  (
    'car-landcruiser-001',
    'TOYO2022LCRUIS001',
    'Toyota',
    'Land Cruiser',
    'ZX Grade',
    2022,
    'Precious White Pearl',
    7500000,
    'available',
    42000,
    'Diesel',
    'Automatic',
    'cred-org-toyota-001',
    '{"stateOfHealth":{"engineHealth":88,"lastInspectionDate":"2024-10-05T10:00:00.000Z"},"damageHistory":{"hasDamage":true,"incidents":[{"date":"2023-06-12T00:00:00.000Z","type":"Minor Collision","description":"Minor front bumper scratch from parking incident","repairCost":85000,"repairedAt":"Toyota Nagoya Service Center","severity":"low"}]},"serviceHistory":{"services":[{"date":"2022-04-01T10:00:00.000Z","type":"Pre-delivery Inspection","dealer":"Toyota Nagoya Dealer","mileage":10},{"date":"2022-10-15T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Nagoya Dealer","mileage":12000},{"date":"2023-04-20T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Nagoya Dealer","mileage":24000},{"date":"2023-07-01T10:00:00.000Z","type":"Damage Repair","dealer":"Toyota Nagoya Service Center","mileage":28000},{"date":"2024-01-10T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Yokohama Dealer","mileage":36000}]},"ownershipChain":{"manufacturer":"Toyota Motor Corporation","manufacturingDate":"2022-03-10T00:00:00.000Z","manufacturingPlant":"Tahara Plant, Aichi","owners":[{"name":"Haruto Sato","from":"2022-04-05T00:00:00.000Z","to":"2023-11-20T00:00:00.000Z"},{"name":"Takeshi Nakamura","from":"2023-11-20T00:00:00.000Z","to":null}],"currentOwner":"Takeshi Nakamura"},"manufacturerCredential":{"credentialId":"cred-org-toyota-001","legalParticipantId":"org-cred-toyota-001","issuer":"Toyota Motor Corporation","type":"OrgVC","issuedAt":"2024-01-15T09:00:00.000Z","status":"active"}}',
    NOW(),
    NOW()
  ),
  (
    'car-corollacross-001',
    'TOYO2020CORCRS001',
    'Toyota',
    'Corolla Cross',
    'S Grade',
    2020,
    'Celestite Gray Metallic',
    2800000,
    'available',
    78000,
    'Petrol',
    'CVT',
    'cred-org-toyota-001',
    '{"stateOfHealth":{"engineHealth":78,"lastInspectionDate":"2024-08-12T10:00:00.000Z"},"damageHistory":{"hasDamage":true,"incidents":[{"date":"2021-09-05T00:00:00.000Z","type":"Rear-end Collision","description":"Moderate rear bumper and tail light damage from rear-end collision","repairCost":220000,"repairedAt":"Toyota Sapporo Service Center","severity":"medium"},{"date":"2023-02-18T00:00:00.000Z","type":"Hail Damage","description":"Body panel dents from hailstorm","repairCost":150000,"repairedAt":"Toyota Sendai Service Center","severity":"low"}]},"serviceHistory":{"services":[{"date":"2020-06-10T10:00:00.000Z","type":"Pre-delivery Inspection","dealer":"Toyota Sapporo Dealer","mileage":8},{"date":"2020-12-15T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Sapporo Dealer","mileage":12000},{"date":"2021-06-20T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Sapporo Dealer","mileage":24000},{"date":"2021-10-01T10:00:00.000Z","type":"Damage Repair","dealer":"Toyota Sapporo Service Center","mileage":30000},{"date":"2022-06-15T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Sendai Dealer","mileage":45000},{"date":"2023-03-10T10:00:00.000Z","type":"Damage Repair","dealer":"Toyota Sendai Service Center","mileage":56000},{"date":"2024-01-20T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Fukuoka Dealer","mileage":72000}]},"ownershipChain":{"manufacturer":"Toyota Motor Corporation","manufacturingDate":"2020-05-15T00:00:00.000Z","manufacturingPlant":"Iwate Plant, Iwate","owners":[{"name":"Sakura Watanabe","from":"2020-06-15T00:00:00.000Z","to":"2022-03-10T00:00:00.000Z"},{"name":"Hiroshi Suzuki","from":"2022-03-10T00:00:00.000Z","to":"2023-09-01T00:00:00.000Z"},{"name":"Mario Sanchez","from":"2023-09-01T00:00:00.000Z","to":null}],"currentOwner":"Mario Sanchez"},"manufacturerCredential":{"credentialId":"cred-org-toyota-001","legalParticipantId":"org-cred-toyota-001","issuer":"Toyota Motor Corporation","type":"OrgVC","issuedAt":"2024-01-15T09:00:00.000Z","status":"active"}}',
    NOW(),
    NOW()
  ),
  (
    'car-yariscross-001',
    'TOYO2025YARCRS001',
    'Toyota',
    'Yaris Cross Hybrid',
    'Z Grade E-Four',
    2025,
    'Brass Gold Metallic',
    3100000,
    'available',
    0,
    'Hybrid',
    'CVT',
    'cred-org-toyota-001',
    '{"stateOfHealth":{"engineHealth":100,"batteryHealth":100,"lastInspectionDate":"2025-02-10T10:00:00.000Z"},"damageHistory":{"hasDamage":false,"incidents":[]},"serviceHistory":{"services":[{"date":"2025-02-10T10:00:00.000Z","type":"Pre-delivery Inspection","dealer":"Toyota Kobe Dealer","mileage":3}]},"ownershipChain":{"manufacturer":"Toyota Motor Corporation","manufacturingDate":"2025-01-28T00:00:00.000Z","manufacturingPlant":"Miyagi Ohira Plant, Miyagi","currentOwner":null},"manufacturerCredential":{"credentialId":"cred-org-toyota-001","legalParticipantId":"org-cred-toyota-001","issuer":"Toyota Motor Corporation","type":"OrgVC","issuedAt":"2024-01-15T09:00:00.000Z","status":"active"}}',
    NOW(),
    NOW()
  ),
  (
    'car-prius-001',
    'TOYO2018PRIUS0001',
    'Toyota',
    'Prius',
    'S Touring Selection',
    2018,
    'Thermo-Tect Lime Green',
    1500000,
    'available',
    135000,
    'Hybrid',
    'CVT',
    'cred-org-toyota-001',
    '{"stateOfHealth":{"engineHealth":65,"batteryHealth":72,"lastInspectionDate":"2024-06-20T10:00:00.000Z"},"damageHistory":{"hasDamage":true,"incidents":[{"date":"2019-04-10T00:00:00.000Z","type":"Side Collision","description":"Left side door and fender damage from intersection collision","repairCost":380000,"repairedAt":"Toyota Hiroshima Service Center","severity":"medium"},{"date":"2020-12-22T00:00:00.000Z","type":"Front Collision","description":"Front bumper, hood and radiator damage from low-speed collision","repairCost":520000,"repairedAt":"Toyota Kyoto Service Center","severity":"high"},{"date":"2023-08-15T00:00:00.000Z","type":"Flood Damage","description":"Partial floor and electrical damage from typhoon flooding","repairCost":290000,"repairedAt":"Toyota Chiba Service Center","severity":"medium"}]},"serviceHistory":{"services":[{"date":"2018-05-01T10:00:00.000Z","type":"Pre-delivery Inspection","dealer":"Toyota Hiroshima Dealer","mileage":5},{"date":"2018-11-10T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Hiroshima Dealer","mileage":15000},{"date":"2019-05-15T10:00:00.000Z","type":"Damage Repair","dealer":"Toyota Hiroshima Service Center","mileage":28000},{"date":"2019-11-20T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Kyoto Dealer","mileage":42000},{"date":"2021-01-10T10:00:00.000Z","type":"Damage Repair","dealer":"Toyota Kyoto Service Center","mileage":65000},{"date":"2021-06-15T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Kyoto Dealer","mileage":78000},{"date":"2022-06-20T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Chiba Dealer","mileage":98000},{"date":"2023-09-01T10:00:00.000Z","type":"Damage Repair","dealer":"Toyota Chiba Service Center","mileage":115000},{"date":"2024-06-20T10:00:00.000Z","type":"Regular Service","dealer":"Toyota Chiba Dealer","mileage":130000}]},"ownershipChain":{"manufacturer":"Toyota Motor Corporation","manufacturingDate":"2018-04-10T00:00:00.000Z","manufacturingPlant":"Tsutsumi Plant, Toyota City, Aichi","owners":[{"name":"Ren Kobayashi","from":"2018-05-05T00:00:00.000Z","to":"2019-08-20T00:00:00.000Z"},{"name":"Aoi Inoue","from":"2019-08-20T00:00:00.000Z","to":"2021-04-10T00:00:00.000Z"},{"name":"Kaito Shimizu","from":"2021-04-10T00:00:00.000Z","to":"2023-01-15T00:00:00.000Z"},{"name":"Mei Hayashi","from":"2023-01-15T00:00:00.000Z","to":null}],"currentOwner":"Mei Hayashi"},"manufacturerCredential":{"credentialId":"cred-org-toyota-001","legalParticipantId":"org-cred-toyota-001","issuer":"Toyota Motor Corporation","type":"OrgVC","issuedAt":"2024-01-15T09:00:00.000Z","status":"active"}}',
    NOW(),
    NOW()
  ),
  (
    'car-chr-hybrid-001',
    'TOYO2024CHRHY0001',
    'Toyota',
    'C-HR Hybrid',
    'G Grade',
    2024,
    'Nebula Blue Metallic',
    3600000,
    'available',
    3200,
    'Hybrid',
    'CVT',
    'cred-org-toyota-001',
    '{"stateOfHealth":{"engineHealth":100,"batteryHealth":100,"lastInspectionDate":"2024-12-01T10:00:00.000Z"},"damageHistory":{"hasDamage":false,"incidents":[]},"serviceHistory":{"services":[{"date":"2024-06-15T10:00:00.000Z","type":"Pre-delivery Inspection","dealer":"Toyota Yokohama Dealer","mileage":6}]},"ownershipChain":{"manufacturer":"Toyota Motor Corporation","manufacturingDate":"2024-05-28T00:00:00.000Z","manufacturingPlant":"Iwate Plant, Iwate","owners":[{"name":"Haruto Sato","from":"2024-06-20T00:00:00.000Z","to":null}],"currentOwner":"Haruto Sato"},"manufacturerCredential":{"credentialId":"cred-org-toyota-001","legalParticipantId":"org-cred-toyota-001","issuer":"Toyota Motor Corporation","type":"OrgVC","issuedAt":"2024-01-15T09:00:00.000Z","status":"active"}}',
    NOW(),
    NOW()
  )
ON CONFLICT ("id") DO UPDATE SET
  "vin"                      = EXCLUDED."vin",
  "make"                     = EXCLUDED."make",
  "model"                    = EXCLUDED."model",
  "variant"                  = EXCLUDED."variant",
  "year"                     = EXCLUDED."year",
  "color"                    = EXCLUDED."color",
  "price"                    = EXCLUDED."price",
  "status"                   = EXCLUDED."status",
  "mileage"                  = EXCLUDED."mileage",
  "fuelType"                 = EXCLUDED."fuelType",
  "transmission"             = EXCLUDED."transmission",
  "manufacturerCredentialId" = EXCLUDED."manufacturerCredentialId",
  "dpp"                      = EXCLUDED."dpp",
  "updatedAt"                = NOW();

-- ─── Wallet for mario-sanchez ─────────────────────────────────────────────────

INSERT INTO "wallets" ("id", "userId", "createdAt", "updatedAt")
VALUES ('wallet-mario-001', 'mario-sanchez', NOW(), NOW())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "wallet_credentials" ("id", "walletId", "credentialId")
SELECT
  'wc-mario-self-001',
  w."id",
  'cred-self-mario-001'
FROM "wallets" w
WHERE w."userId" = 'mario-sanchez'
ON CONFLICT ("walletId", "credentialId") DO NOTHING;

-- ─── Org Credentials ──────────────────────────────────────────────────────────

INSERT INTO "org_credentials" ("id", "companyId", "legalName", "legalRegistrationNumber", "legalAddress", "headquartersAddress", "website", "contactEmail", "did", "validFrom", "validUntil", "verificationStatus", "verificationAttempts", "issuedVCs", "createdAt", "updatedAt")
VALUES
  (
    'org-cred-toyota-001',
    'company-toyota-001',
    'Toyota Motor Corporation',
    '{"vatId":"JP-TOYOTA-VAT-2024","localId":"JP-2180-01-008555","taxId":"T7180301018771"}',
    '{"streetAddress":"1 Toyota-cho","locality":"Toyota City","postalCode":"471-8571","countryCode":"JP","countrySubdivisionCode":"JP-23"}',
    '{"streetAddress":"1 Toyota-cho","locality":"Toyota City","postalCode":"471-8571","countryCode":"JP","countrySubdivisionCode":"JP-23"}',
    'https://www.toyota-global.com',
    'admin@toyota-global.com',
    'did:web:participant.gxdch.io:toyota-motor',
    '2024-01-15T09:00:00.000Z',
    '2027-01-15T09:00:00.000Z',
    'draft',
    '[]',
    '[]',
    NOW(),
    NOW()
  ),
  (
    'org-cred-tokiomarine-001',
    'company-tokiomarine-001',
    'Tokio Marine & Nichido Fire Insurance Co., Ltd.',
    '{"vatId":"JP-TOKIOMARINE-VAT-2024","localId":"JP-0100-01-004749","taxId":"T9010001008771"}',
    '{"streetAddress":"1-2-1 Marunouchi, Chiyoda-ku","locality":"Tokyo","postalCode":"100-0005","countryCode":"JP","countrySubdivisionCode":"JP-13"}',
    '{"streetAddress":"1-2-1 Marunouchi, Chiyoda-ku","locality":"Tokyo","postalCode":"100-0005","countryCode":"JP","countrySubdivisionCode":"JP-13"}',
    'https://www.tokiomarine-nichido.co.jp',
    'admin@tokiomarine.com',
    'did:web:participant.gxdch.io:tokio-marine',
    '2024-02-01T09:00:00.000Z',
    '2027-02-01T09:00:00.000Z',
    'draft',
    '[]',
    '[]',
    NOW(),
    NOW()
  )
ON CONFLICT ("id") DO UPDATE SET
  "legalName"               = EXCLUDED."legalName",
  "legalRegistrationNumber" = EXCLUDED."legalRegistrationNumber",
  "legalAddress"            = EXCLUDED."legalAddress",
  "headquartersAddress"     = EXCLUDED."headquartersAddress",
  "website"                 = EXCLUDED."website",
  "contactEmail"            = EXCLUDED."contactEmail",
  "did"                     = EXCLUDED."did",
  "validFrom"               = EXCLUDED."validFrom",
  "validUntil"              = EXCLUDED."validUntil",
  "updatedAt"               = NOW();
