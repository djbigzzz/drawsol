/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/drawsol.json`.
 */
export type Drawsol = {
  "address": "FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb",
  "metadata": {
    "name": "drawsol",
    "version": "4.0.0",
    "spec": "0.1.0",
    "description": "DrawSol v4 - escrowed end prize, published instant-prize schedule, random ticket numbers via ORAO VRF"
  },
  "instructions": [
    {
      "name": "buyTickets",
      "docs": [
        "Buys `quantity` (≤ max_per_tx ≤ 1000) tickets as one entry and requests its ORAO randomness."
      ],
      "discriminator": [
        48,
        16,
        122,
        137,
        24,
        214,
        198,
        58
      ],
      "accounts": [
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "entry",
          "docs": [
            "Sized from `quantity` (tickets + prizes vectors). Clamped to MAX_PER_TX so an oversized quantity",
            "fails with `ExceedsPerTx` in the handler rather than with the allocator's size limit."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "draw.entry_count",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "docs": [
            "Pays the tickets, the ORAO fee and rent; becomes the entry owner."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vrfRequest",
          "docs": [
            "and created by the ORAO CPI (`init`, so never reused)."
          ],
          "writable": true
        },
        {
          "name": "vrfConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  110,
                  101,
                  116,
                  119,
                  111,
                  114,
                  107,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120
              ]
            }
          }
        },
        {
          "name": "vrfTreasury",
          "writable": true
        },
        {
          "name": "vrf",
          "address": "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "quantity",
          "type": "u16"
        },
        {
          "name": "clientNonce",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "cancelDraw",
      "docs": [
        "Cancels a draw whose randomness never arrived (anyone, 48 h after draw_at) or a Draft (authority)."
      ],
      "discriminator": [
        105,
        47,
        245,
        199,
        42,
        255,
        88,
        48
      ],
      "accounts": [
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "claimFreeEntry",
      "docs": [
        "One free ticket per wallet, up to `free_cap`: a normal ticket in every respect."
      ],
      "discriminator": [
        201,
        113,
        129,
        68,
        22,
        131,
        119,
        181
      ],
      "accounts": [
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "draw.entry_count",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "vrfRequest",
          "writable": true
        },
        {
          "name": "vrfConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  110,
                  101,
                  116,
                  119,
                  111,
                  114,
                  107,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120
              ]
            }
          }
        },
        {
          "name": "vrfTreasury",
          "writable": true
        },
        {
          "name": "vrf",
          "address": "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "clientNonce",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "claimRefund",
      "docs": [
        "Permissionless. Refunds an entry of a cancelled draw (paid − instant prizes received)."
      ],
      "discriminator": [
        15,
        16,
        30,
        161,
        255,
        228,
        97,
        60
      ],
      "accounts": [
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          },
          "relations": [
            "entry"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.seq",
                "account": "entryV4"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "relations": [
            "entry"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "createDraw",
      "docs": [
        "Admin or keeper. Creates a Draft draw with its vault, pool header and (zeroed) schedule.",
        "Validates the SPEC-v4 §1 inequalities."
      ],
      "discriminator": [
        107,
        29,
        230,
        63,
        112,
        148,
        0,
        105
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "config.next_draw_id",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "pool",
          "docs": [
            "Header only (`remaining = 0`); `init_pool` grows and fills it."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "schedule",
          "docs": [
            "Zeroed; full size when `8 + cap ≤ 10 KB`, else grown by `init_pool`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  99,
                  104,
                  101,
                  100,
                  117,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "creator",
          "docs": [
            "Admin or keeper; pays rent only (the escrow comes from the authority at `open_draw`)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createDrawParams"
            }
          }
        }
      ]
    },
    {
      "name": "initConfig",
      "docs": [
        "Fresh deployments: creates the Config. Signer must be the program's upgrade authority."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "program",
          "address": "FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initPool",
      "docs": [
        "Admin or keeper. Fills `pool[from..to] = from..to` (sequential chunks of ≤ 2000), growing the account."
      ],
      "discriminator": [
        116,
        233,
        199,
        204,
        115,
        159,
        171,
        36
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "draw",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "schedule",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  99,
                  104,
                  101,
                  100,
                  117,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "from",
          "type": "u32"
        },
        {
          "name": "to",
          "type": "u32"
        }
      ]
    },
    {
      "name": "legacyCloseV3",
      "docs": [
        "Admin only. Closes a v3 draw + vault (raw-byte parse) into the admin: zero entries (escrow back),",
        "or Settled / Cancelled with nothing owed."
      ],
      "discriminator": [
        187,
        1,
        61,
        187,
        43,
        54,
        55,
        115
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "docs": [
            "Receives every lamport of the v3 draw and vault."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "legacyDraw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  51
                ]
              },
              {
                "kind": "arg",
                "path": "drawId"
              }
            ]
          }
        },
        {
          "name": "legacyVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  51
                ]
              },
              {
                "kind": "account",
                "path": "legacyDraw"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "drawId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openDraw",
      "docs": [
        "Authority. Draft → Open: pool complete, schedule complete, escrows end prize + schedule total,",
        "emits the schedule hash."
      ],
      "discriminator": [
        112,
        254,
        220,
        225,
        218,
        132,
        209,
        144
      ],
      "accounts": [
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "schedule",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  99,
                  104,
                  101,
                  100,
                  117,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "authority",
          "docs": [
            "Escrows the prizes."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "draw"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "requestDraw",
      "docs": [
        "At draw_at: keeper/authority first, anyone after the public grace. Requests the end-prize",
        "randomness, or cancels and returns the escrow when nothing was sold."
      ],
      "discriminator": [
        22,
        180,
        8,
        81,
        47,
        21,
        86,
        159
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true
        },
        {
          "name": "payer",
          "docs": [
            "Pays the ORAO fee; must be the keeper or the authority during the grace window."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vrfRequest",
          "docs": [
            "Not needed when the draw is cancelled here (no tickets)."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "vrfConfig",
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  110,
                  101,
                  116,
                  119,
                  111,
                  114,
                  107,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120
              ]
            }
          }
        },
        {
          "name": "vrfTreasury",
          "writable": true,
          "optional": true
        },
        {
          "name": "vrf",
          "optional": true,
          "address": "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "clientNonce",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "revealEntry",
      "docs": [
        "Permissionless. Assigns the entry's ticket numbers at random from the pool, looks them up in the",
        "schedule and pays the instant prizes from the vault to the owner."
      ],
      "discriminator": [
        55,
        129,
        203,
        100,
        95,
        189,
        241,
        116
      ],
      "accounts": [
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          },
          "relations": [
            "entry"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "schedule",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  99,
                  104,
                  101,
                  100,
                  117,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.seq",
                "account": "entryV4"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.owner",
                "account": "entryV4"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "vrfRequest"
        }
      ],
      "args": []
    },
    {
      "name": "selfExclude",
      "docs": [
        "Self-exclusion until `until` (unix seconds); can only be extended."
      ],
      "discriminator": [
        18,
        245,
        91,
        0,
        7,
        239,
        172,
        213
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "until",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setKeeper",
      "docs": [
        "Admin only."
      ],
      "discriminator": [
        102,
        94,
        23,
        78,
        157,
        222,
        243,
        214
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setLimit",
      "docs": [
        "Spend limit per 30 days (0 = none). Decrease now, increase after 72 h."
      ],
      "discriminator": [
        51,
        224,
        252,
        238,
        154,
        84,
        60,
        174
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setSchedule",
      "docs": [
        "Admin or keeper. Registers winning numbers (≤ 300 per call), each once, per-tier counts enforced."
      ],
      "discriminator": [
        224,
        44,
        153,
        248,
        237,
        182,
        26,
        154
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "schedule",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  99,
                  104,
                  101,
                  100,
                  117,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "entries",
          "type": {
            "vec": {
              "defined": {
                "name": "scheduleEntry"
              }
            }
          }
        }
      ]
    },
    {
      "name": "settleDraw",
      "docs": [
        "Permissionless. Pays the end prize (or the fallback pot) to the owner of the entry holding the",
        "winning position; returns unused escrow to the authority."
      ],
      "discriminator": [
        175,
        154,
        75,
        30,
        118,
        117,
        107,
        194
      ],
      "accounts": [
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "vrfRequest"
        },
        {
          "name": "winningEntry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "winning_entry.seq",
                "account": "entryV4"
              }
            ]
          }
        },
        {
          "name": "winner",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "docs": [
        "Authority only. House share (+ released schedule escrow) after settlement; a cancelled draw's escrow."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV4"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  52
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "draw"
          ]
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "drawV4",
      "discriminator": [
        102,
        90,
        64,
        115,
        209,
        8,
        242,
        137
      ]
    },
    {
      "name": "entryV4",
      "discriminator": [
        185,
        87,
        25,
        103,
        30,
        232,
        241,
        205
      ]
    },
    {
      "name": "networkState",
      "discriminator": [
        212,
        237,
        148,
        56,
        97,
        245,
        51,
        169
      ]
    },
    {
      "name": "playerV4",
      "discriminator": [
        37,
        134,
        128,
        128,
        26,
        182,
        14,
        27
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "profile",
      "discriminator": [
        184,
        101,
        165,
        188,
        95,
        63,
        127,
        188
      ]
    },
    {
      "name": "schedule",
      "discriminator": [
        217,
        243,
        116,
        56,
        73,
        82,
        207,
        51
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "drawCancelled",
      "discriminator": [
        102,
        73,
        15,
        251,
        79,
        207,
        0,
        104
      ]
    },
    {
      "name": "drawCreated",
      "discriminator": [
        198,
        225,
        129,
        157,
        178,
        202,
        47,
        191
      ]
    },
    {
      "name": "drawOpened",
      "discriminator": [
        115,
        154,
        69,
        194,
        0,
        227,
        121,
        20
      ]
    },
    {
      "name": "drawRequested",
      "discriminator": [
        59,
        172,
        219,
        42,
        28,
        94,
        93,
        75
      ]
    },
    {
      "name": "drawSettled",
      "discriminator": [
        137,
        166,
        132,
        30,
        8,
        142,
        219,
        129
      ]
    },
    {
      "name": "entryRevealed",
      "discriminator": [
        20,
        92,
        221,
        89,
        142,
        166,
        26,
        59
      ]
    },
    {
      "name": "freeEntryClaimed",
      "discriminator": [
        28,
        147,
        67,
        112,
        107,
        161,
        46,
        242
      ]
    },
    {
      "name": "keeperSet",
      "discriminator": [
        116,
        85,
        200,
        22,
        76,
        163,
        56,
        243
      ]
    },
    {
      "name": "legacyClosed",
      "discriminator": [
        206,
        178,
        254,
        228,
        149,
        196,
        78,
        17
      ]
    },
    {
      "name": "limitSet",
      "discriminator": [
        61,
        207,
        15,
        115,
        70,
        8,
        73,
        102
      ]
    },
    {
      "name": "poolInitialised",
      "discriminator": [
        141,
        214,
        45,
        117,
        209,
        51,
        224,
        221
      ]
    },
    {
      "name": "refunded",
      "discriminator": [
        35,
        103,
        149,
        246,
        196,
        123,
        221,
        99
      ]
    },
    {
      "name": "scheduleSet",
      "discriminator": [
        144,
        221,
        214,
        78,
        222,
        207,
        219,
        253
      ]
    },
    {
      "name": "selfExcluded",
      "discriminator": [
        234,
        247,
        55,
        66,
        132,
        250,
        160,
        150
      ]
    },
    {
      "name": "ticketsPurchased",
      "discriminator": [
        185,
        114,
        111,
        225,
        124,
        92,
        18,
        143
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not allowed to perform this action"
    },
    {
      "code": 6001,
      "name": "invalidParams",
      "msg": "Invalid parameters"
    },
    {
      "code": 6002,
      "name": "salesClosed",
      "msg": "Sales for this draw are closed"
    },
    {
      "code": 6003,
      "name": "salesStillOpen",
      "msg": "Sales are still open: the draw is not due yet"
    },
    {
      "code": 6004,
      "name": "soldOut",
      "msg": "Not enough tickets left"
    },
    {
      "code": 6005,
      "name": "exceedsPerTx",
      "msg": "Quantity exceeds the per-transaction limit"
    },
    {
      "code": 6006,
      "name": "exceedsWalletCap",
      "msg": "Quantity exceeds the per-wallet limit"
    },
    {
      "code": 6007,
      "name": "freeCapReached",
      "msg": "All free entries have been claimed"
    },
    {
      "code": 6008,
      "name": "freeAlreadyClaimed",
      "msg": "This wallet already claimed its free entry"
    },
    {
      "code": 6009,
      "name": "wrongStatus",
      "msg": "The draw is not in the right status for this action"
    },
    {
      "code": 6010,
      "name": "vrfWrongOwner",
      "msg": "Randomness account is not owned by ORAO VRF"
    },
    {
      "code": 6011,
      "name": "vrfWrongAccount",
      "msg": "Randomness account does not match the stored request"
    },
    {
      "code": 6012,
      "name": "vrfSeedMismatch",
      "msg": "Randomness seed mismatch"
    },
    {
      "code": 6013,
      "name": "vrfNotFulfilled",
      "msg": "Randomness has not been fulfilled yet"
    },
    {
      "code": 6014,
      "name": "alreadyRevealed",
      "msg": "Entry already revealed"
    },
    {
      "code": 6015,
      "name": "wrongWinningEntry",
      "msg": "This entry does not hold the winning position"
    },
    {
      "code": 6016,
      "name": "winnerNotRevealed",
      "msg": "The winning entry has not been revealed yet"
    },
    {
      "code": 6017,
      "name": "notCancellable",
      "msg": "The draw cannot be cancelled yet"
    },
    {
      "code": 6018,
      "name": "alreadyRefunded",
      "msg": "Entry already refunded"
    },
    {
      "code": 6019,
      "name": "nothingToRefund",
      "msg": "Nothing to refund for this entry"
    },
    {
      "code": 6020,
      "name": "nothingToWithdraw",
      "msg": "Nothing to withdraw right now"
    },
    {
      "code": 6021,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6022,
      "name": "drawNotDue",
      "msg": "The draw is not due yet (draw_at)"
    },
    {
      "code": 6023,
      "name": "spendLimitExceeded",
      "msg": "This purchase would exceed your spend limit for the period"
    },
    {
      "code": 6024,
      "name": "selfExcluded",
      "msg": "This wallet is self-excluded"
    },
    {
      "code": 6025,
      "name": "vaultShortfall",
      "msg": "The vault cannot cover this payment yet; the operator must top it up"
    },
    {
      "code": 6026,
      "name": "notLegacyAccount",
      "msg": "Account is not a legacy account of this program"
    },
    {
      "code": 6027,
      "name": "legacyNotClosable",
      "msg": "The legacy draw still holds liabilities and cannot be closed"
    },
    {
      "code": 6028,
      "name": "wrongSideAccount",
      "msg": "Pool / Schedule account is not the draw's (owner, seeds or discriminator)"
    },
    {
      "code": 6029,
      "name": "badPoolChunk",
      "msg": "init_pool chunk must start at the next unfilled number and hold 1..=2000 numbers up to the cap"
    },
    {
      "code": 6030,
      "name": "poolIncomplete",
      "msg": "The pool is not fully initialised yet"
    },
    {
      "code": 6031,
      "name": "badScheduleBatch",
      "msg": "Schedule batch is empty or larger than 300"
    },
    {
      "code": 6032,
      "name": "duplicateScheduleTicket",
      "msg": "This ticket number is already in the schedule"
    },
    {
      "code": 6033,
      "name": "tierFull",
      "msg": "This tier already has every winning number registered"
    },
    {
      "code": 6034,
      "name": "scheduleIncomplete",
      "msg": "Not every tier has all its winning numbers registered"
    },
    {
      "code": 6035,
      "name": "poolExhausted",
      "msg": "The pool is corrupt: no numbers left to assign"
    }
  ],
  "types": [
    {
      "name": "config",
      "docs": [
        "seeds = [b\"config\"]",
        "",
        "Unchanged since v3 (`admin, keeper, next_draw_id, bump`); devnet's account is already in this layout."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "docs": [
              "Low-trust automation key: may create draws, fill pools/schedules and request draws during the",
              "public-grace window. It never escrows money and never receives the house share."
            ],
            "type": "pubkey"
          },
          {
            "name": "nextDrawId",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "createDrawParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ticketPrice",
            "type": "u64"
          },
          {
            "name": "ticketCap",
            "type": "u32"
          },
          {
            "name": "maxPerTx",
            "type": "u16"
          },
          {
            "name": "maxPerWallet",
            "type": "u32"
          },
          {
            "name": "freeCap",
            "type": "u32"
          },
          {
            "name": "closesAt",
            "type": "i64"
          },
          {
            "name": "drawAt",
            "type": "i64"
          },
          {
            "name": "publicGraceSecs",
            "type": "u32"
          },
          {
            "name": "houseBps",
            "type": "u16"
          },
          {
            "name": "potBps",
            "type": "u16"
          },
          {
            "name": "instantBps",
            "type": "u16"
          },
          {
            "name": "endPrizeLamports",
            "type": "u64"
          },
          {
            "name": "minTickets",
            "type": "u32"
          },
          {
            "name": "tiers",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "tierParams"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "termsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "drawCancelled",
      "docs": [
        "reason: 0 = no tickets, 1 = randomness timeout, 3 = draft cancelled by the authority"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "drawCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "ticketPrice",
            "type": "u64"
          },
          {
            "name": "ticketCap",
            "type": "u32"
          },
          {
            "name": "closesAt",
            "type": "i64"
          },
          {
            "name": "drawAt",
            "type": "i64"
          },
          {
            "name": "houseBps",
            "type": "u16"
          },
          {
            "name": "potBps",
            "type": "u16"
          },
          {
            "name": "instantBps",
            "type": "u16"
          },
          {
            "name": "endPrizeLamports",
            "type": "u64"
          },
          {
            "name": "minTickets",
            "type": "u32"
          },
          {
            "name": "scheduleTotalLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "drawOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "scheduleHash",
            "docs": [
              "sha256 of the `ticket_cap` schedule bytes (tier index + 1 per number, 0 = no prize) at opening"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "escrowLamports",
            "docs": [
              "end prize + schedule total, escrowed by the authority"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "drawRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "vrfRequest",
            "type": "pubkey"
          },
          {
            "name": "totalTickets",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "drawSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "winningPos",
            "type": "u32"
          },
          {
            "name": "winningTicket",
            "type": "u32"
          },
          {
            "name": "winningEntry",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "endPrizePaid",
            "type": "u64"
          },
          {
            "name": "fallback",
            "docs": [
              "true when `paid_tickets < min_tickets` and the fallback pot was paid instead of the end prize"
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "drawStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "draft"
          },
          {
            "name": "open"
          },
          {
            "name": "drawing"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "drawV4",
      "docs": [
        "seeds = [b\"draw4\", id.to_le_bytes()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "authority",
            "docs": [
              "config.admin at creation; escrows the prizes at `open_draw`, receives the house share / returned escrow"
            ],
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "drawStatus"
              }
            }
          },
          {
            "name": "ticketPrice",
            "type": "u64"
          },
          {
            "name": "ticketCap",
            "docs": [
              "ticket numbers are 0..ticket_cap; every ticket (paid or free) takes one number, so this caps all tickets"
            ],
            "type": "u32"
          },
          {
            "name": "maxPerTx",
            "type": "u16"
          },
          {
            "name": "maxPerWallet",
            "docs": [
              "all ticket kinds"
            ],
            "type": "u32"
          },
          {
            "name": "freeCap",
            "type": "u32"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "closesAt",
            "type": "i64"
          },
          {
            "name": "drawAt",
            "docs": [
              ">= closes_at; sell-out ends sales early, the draw still waits for draw_at"
            ],
            "type": "i64"
          },
          {
            "name": "publicGraceSecs",
            "docs": [
              "only keeper/authority may request the draw during [draw_at, draw_at + grace)"
            ],
            "type": "u32"
          },
          {
            "name": "houseBps",
            "type": "u16"
          },
          {
            "name": "potBps",
            "type": "u16"
          },
          {
            "name": "instantBps",
            "type": "u16"
          },
          {
            "name": "endPrizeLamports",
            "docs": [
              "fixed end prize, escrowed at open; paid in full when paid_tickets >= min_tickets"
            ],
            "type": "u64"
          },
          {
            "name": "minTickets",
            "type": "u32"
          },
          {
            "name": "tiers",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "tier"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "scheduleTotalLamports",
            "docs": [
              "Σ tiers.amount × count — escrowed at open"
            ],
            "type": "u64"
          },
          {
            "name": "scheduleSet",
            "docs": [
              "winning numbers registered so far (== Σ tiers.count once Open)"
            ],
            "type": "u32"
          },
          {
            "name": "instantsPaid",
            "docs": [
              "instant prizes paid so far"
            ],
            "type": "u64"
          },
          {
            "name": "revenue",
            "docs": [
              "every lamport paid for tickets"
            ],
            "type": "u64"
          },
          {
            "name": "houseLamports",
            "docs": [
              "fixed at settle: revenue − fallback pot (if paid); withdrawable after Settled"
            ],
            "type": "u64"
          },
          {
            "name": "houseWithdrawn",
            "type": "u64"
          },
          {
            "name": "refundedLamports",
            "type": "u64"
          },
          {
            "name": "paidTickets",
            "type": "u32"
          },
          {
            "name": "freeTickets",
            "type": "u32"
          },
          {
            "name": "assigned",
            "docs": [
              "tickets that have a number (revealed)"
            ],
            "type": "u32"
          },
          {
            "name": "nextPos",
            "docs": [
              "positions handed out: every ticket (paid or free) gets the next position at purchase"
            ],
            "type": "u32"
          },
          {
            "name": "entryCount",
            "type": "u32"
          },
          {
            "name": "revealedEntries",
            "type": "u32"
          },
          {
            "name": "drawVrfRequest",
            "type": "pubkey"
          },
          {
            "name": "drawVrfSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "randomness",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "winningPos",
            "type": "u32"
          },
          {
            "name": "winningTicket",
            "type": "u32"
          },
          {
            "name": "winningEntry",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "endPrizePaid",
            "docs": [
              "what the winner actually received (end prize, or the fallback pot)"
            ],
            "type": "u64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "prizePaid",
            "docs": [
              "the prize was disbursed (to the winner, or the fallback pot was paid)"
            ],
            "type": "bool"
          },
          {
            "name": "escrowReturned",
            "docs": [
              "the end-prize escrow has left the vault (paid to the winner, or returned to the authority)"
            ],
            "type": "bool"
          },
          {
            "name": "instantEscrowReturned",
            "docs": [
              "the unwon part of the schedule escrow (schedule_total − instants_paid) was returned to the authority"
            ],
            "type": "bool"
          },
          {
            "name": "termsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "poolBump",
            "type": "u8"
          },
          {
            "name": "scheduleBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "entryRevealed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "entry",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "seq",
            "type": "u32"
          },
          {
            "name": "tickets",
            "type": {
              "vec": "u32"
            }
          },
          {
            "name": "prizes",
            "docs": [
              "per ticket: 0 = no prize, t+1 = tier t"
            ],
            "type": "bytes"
          },
          {
            "name": "paid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "entryV4",
      "docs": [
        "seeds = [b\"entry4\", draw.key(), seq.to_le_bytes()] where seq = draw.entry_count at creation.",
        "Space is sized from `count` at purchase: `EntryV4::space(count)`.",
        "",
        "Fixed-size fields come first (memcmp-friendly offsets: draw @8, owner @40, seq @72, first_pos @76,",
        "count @80, is_free @82, ...); the two vectors are at the end."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "seq",
            "type": "u32"
          },
          {
            "name": "firstPos",
            "docs": [
              "positions first_pos .. first_pos + count belong to this entry (the end-prize draw picks a position)"
            ],
            "type": "u32"
          },
          {
            "name": "count",
            "type": "u16"
          },
          {
            "name": "isFree",
            "type": "bool"
          },
          {
            "name": "paidLamports",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "vrfRequest",
            "docs": [
              "ORAO randomness request PDA for this entry's ticket assignment"
            ],
            "type": "pubkey"
          },
          {
            "name": "vrfSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "revealed",
            "type": "bool"
          },
          {
            "name": "instantPaid",
            "docs": [
              "instant prizes paid to the owner at reveal"
            ],
            "type": "u64"
          },
          {
            "name": "refunded",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "tickets",
            "docs": [
              "ticket numbers, len == count once revealed (empty before)"
            ],
            "type": {
              "vec": "u32"
            }
          },
          {
            "name": "prizes",
            "docs": [
              "per ticket: 0 = no prize, t + 1 = tier t (len == count once revealed)"
            ],
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "freeEntryClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "entry",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "seq",
            "type": "u32"
          },
          {
            "name": "pos",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "keeperSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "keeper",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "legacyClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "drawId",
            "type": "u64"
          },
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "limitSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "limitLamports",
            "type": "u64"
          },
          {
            "name": "pendingLimit",
            "type": "u64"
          },
          {
            "name": "pendingFrom",
            "docs": [
              "0 = nothing pending"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "networkConfiguration",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "requestFee",
            "type": "u64"
          },
          {
            "name": "fulfillmentAuthorities",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "tokenFeeConfig",
            "type": {
              "option": {
                "defined": {
                  "name": "oraoTokenFeeConfig"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "networkState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "networkConfiguration"
              }
            }
          },
          {
            "name": "numReceived",
            "docs": [
              "Total number of received requests."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "oraoTokenFeeConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "ORAO token mint address."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "ORAO token treasury account."
            ],
            "type": "pubkey"
          },
          {
            "name": "fee",
            "docs": [
              "Fee in ORAO SPL token smallest units."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "playerV4",
      "docs": [
        "seeds = [b\"player4\", draw.key(), wallet]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "tickets",
            "docs": [
              "all kinds (paid + free)"
            ],
            "type": "u32"
          },
          {
            "name": "paid",
            "docs": [
              "lamports paid for tickets"
            ],
            "type": "u64"
          },
          {
            "name": "wonLamports",
            "docs": [
              "instant prizes received"
            ],
            "type": "u64"
          },
          {
            "name": "freeClaimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pool",
      "docs": [
        "seeds = [b\"pool\", draw.key()]. Raw layout after the discriminator: `remaining: u32` then",
        "`u32[ticket_cap]` ticket numbers. Filled 0..cap by `init_pool`; `reveal_entry` swap-removes from",
        "`[..remaining]`. Accessed by raw bytes (never deserialised) — this type only names the discriminator."
      ],
      "type": {
        "kind": "struct",
        "fields": []
      }
    },
    {
      "name": "poolInitialised",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "u32"
          },
          {
            "name": "to",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "profile",
      "docs": [
        "seeds = [b\"profile\", wallet]. Global across draws. Unchanged since v3 (SPEC-v3 §2.6)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "credits",
            "docs": [
              "v3 free-ticket credits; kept for layout compatibility, unused in v4 (no credit tiers)"
            ],
            "type": "u32"
          },
          {
            "name": "limitLamports",
            "docs": [
              "0 = no limit"
            ],
            "type": "u64"
          },
          {
            "name": "pendingLimit",
            "type": "u64"
          },
          {
            "name": "pendingFrom",
            "docs": [
              "0 = no pending change; otherwise `pending_limit` applies from this time"
            ],
            "type": "i64"
          },
          {
            "name": "periodStart",
            "type": "i64"
          },
          {
            "name": "periodSpent",
            "type": "u64"
          },
          {
            "name": "excludedUntil",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "refunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "entry",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "schedule",
      "docs": [
        "seeds = [b\"schedule\", draw.key()]. Raw layout after the discriminator: `u8[ticket_cap]`,",
        "`0` = no prize, `1..=8` = tier index + 1, bit 7 = that number's prize has been won."
      ],
      "type": {
        "kind": "struct",
        "fields": []
      }
    },
    {
      "name": "scheduleEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ticket",
            "docs": [
              "winning ticket number, < ticket_cap"
            ],
            "type": "u32"
          },
          {
            "name": "tier",
            "docs": [
              "tier index 0..8 (stored in the schedule as tier + 1)"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "scheduleSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "scheduleSet",
            "docs": [
              "winning numbers registered so far"
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "selfExcluded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "excludedUntil",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ticketsPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "entry",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "seq",
            "type": "u32"
          },
          {
            "name": "firstPos",
            "type": "u32"
          },
          {
            "name": "count",
            "type": "u16"
          },
          {
            "name": "paidLamports",
            "type": "u64"
          },
          {
            "name": "revenueLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tier",
      "docs": [
        "One instant-prize tier. Unused = all zero."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "docs": [
              "prize per winning number, lamports"
            ],
            "type": "u64"
          },
          {
            "name": "count",
            "docs": [
              "winning numbers in the schedule"
            ],
            "type": "u16"
          },
          {
            "name": "set",
            "docs": [
              "winning numbers registered so far by `set_schedule` (== count once the draw is Open)"
            ],
            "type": "u16"
          },
          {
            "name": "won",
            "docs": [
              "winning numbers assigned (and paid) so far"
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "tierParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "docs": [
              "prize per winning number, lamports (0 = unused tier)"
            ],
            "type": "u64"
          },
          {
            "name": "count",
            "docs": [
              "winning numbers of this tier"
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "vault",
      "docs": [
        "seeds = [b\"vault4\", draw.key()]. Program-owned, no fields: its lamports are everything the draw holds.",
        "Debited directly by the program; it always stays rent-exempt."
      ],
      "type": {
        "kind": "struct",
        "fields": []
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "draw",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
