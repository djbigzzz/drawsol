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
    "version": "3.0.0",
    "spec": "0.1.0",
    "description": "DrawSol v3 - pot and headline prize draws with ORAO VRF instant wins"
  },
  "instructions": [
    {
      "name": "buyTickets",
      "docs": [
        "Buys `quantity` tickets as one entry, `use_credits` of them paid with credits.",
        "Pot draws with instant tiers request the entry's ORAO randomness."
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV3"
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
                  51
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "draw.entry_count",
                "account": "drawV3"
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
                  51
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
            "Pays the tickets, the ORAO fee (pot draws) and rent; becomes the entry owner."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vrfRequest",
          "docs": [
            "checked in `request_randomness` and created by the ORAO CPI (`init`, so never reused)."
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
          "name": "quantity",
          "type": "u16"
        },
        {
          "name": "useCredits",
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
        "Permissionless. Cancels a draw whose randomness never arrived (after the grace period)."
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV3"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimFreeEntry",
      "docs": [
        "One free ticket per wallet, up to `free_cap`. Rolls for instant wins in pot draws."
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV3"
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "draw.entry_count",
                "account": "drawV3"
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
                  51
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
            "The claiming wallet (pays rent and, in pot draws, the ORAO fee; becomes the entry owner)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vrfRequest",
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
      "name": "claimRefund",
      "docs": [
        "Permissionless. Refunds an entry of a cancelled draw (paid − instant SOL received; credits back)."
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV3"
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
                  51
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.seq",
                "account": "entryV3"
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
                "path": "entry.owner",
                "account": "entryV3"
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
      "name": "createHeadlineDraw",
      "docs": [
        "Admin only. Headline draw; escrows the prize. Enforces sell-out house share and the floor margin."
      ],
      "discriminator": [
        213,
        32,
        22,
        3,
        28,
        221,
        209,
        205
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
                  51
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
                  51
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
          "name": "admin",
          "docs": [
            "Pays rent and escrows the prize."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
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
              "name": "headlineDrawParams"
            }
          }
        }
      ]
    },
    {
      "name": "createPotDraw",
      "docs": [
        "Admin or keeper. Nightly pot draw; no escrow. Enforces the house/pot/instant split bounds."
      ],
      "discriminator": [
        18,
        114,
        222,
        212,
        15,
        39,
        32,
        111
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
                  51
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
                  51
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
            "Admin or keeper; pays rent only (no escrow)."
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
              "name": "potDrawParams"
            }
          }
        }
      ]
    },
    {
      "name": "initConfig",
      "docs": [
        "Fresh deployments: creates the v3 Config. Signer must be the program's upgrade authority."
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
      "name": "legacyCloseV2",
      "docs": [
        "Admin only. Closes an empty or fully settled v2 draw + vault (raw-byte parse) into the admin."
      ],
      "discriminator": [
        137,
        242,
        182,
        192,
        93,
        74,
        120,
        216
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
            "Receives every lamport of the v2 draw and vault."
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
                  119
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
                  116
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
      "name": "migrateConfig",
      "docs": [
        "Admin only. Reallocs the v2 Config into the v3 layout and sets the keeper."
      ],
      "discriminator": [
        92,
        131,
        58,
        105,
        210,
        154,
        224,
        193
      ],
      "accounts": [
        {
          "name": "config",
          "docs": [
            "owner, discriminator and length checked in the handler."
          ],
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
          "docs": [
            "Must be the admin stored in the v2 Config. Pays the extra rent."
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
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "requestDraw",
      "docs": [
        "At draw_at: keeper/authority first, anyone after the public grace. Requests the grand-draw",
        "randomness, or cancels (no tickets / headline below min_tickets)."
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV3"
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
                  51
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
            "Not needed when the draw is cancelled here (no tickets / headline undersold)."
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
        "Permissionless. Computes a pot entry's instant results and pays them from the instant pool."
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV3"
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
                  51
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.seq",
                "account": "entryV3"
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.owner",
                "account": "entryV3"
              }
            ]
          }
        },
        {
          "name": "profile",
          "docs": [
            "Receives credit prizes."
          ],
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
                "path": "entry.owner",
                "account": "entryV3"
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
      "name": "settleDraw",
      "docs": [
        "Permissionless. Pays the prize to the owner of the entry holding the winning ticket."
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV3"
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
                  51
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "winning_entry.seq",
                "account": "entryV3"
              }
            ]
          }
        },
        {
          "name": "winner",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "docs": [
        "Authority only. House share after settlement; a cancelled headline's escrow."
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
                  51
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "drawV3"
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
                  51
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
      "name": "drawV3",
      "discriminator": [
        206,
        90,
        215,
        73,
        142,
        148,
        222,
        180
      ]
    },
    {
      "name": "entryV3",
      "discriminator": [
        74,
        167,
        205,
        142,
        221,
        218,
        145,
        92
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
      "name": "playerV3",
      "discriminator": [
        130,
        220,
        60,
        9,
        70,
        116,
        81,
        47
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
      "name": "vaultV3",
      "discriminator": [
        184,
        9,
        135,
        157,
        3,
        29,
        93,
        211
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
      "name": "noInstantRoll",
      "msg": "This entry has no instant roll"
    },
    {
      "code": 6016,
      "name": "wrongWinningEntry",
      "msg": "This entry does not hold the winning ticket"
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
      "name": "insufficientCredits",
      "msg": "Not enough credits"
    },
    {
      "code": 6024,
      "name": "spendLimitExceeded",
      "msg": "This purchase would exceed your spend limit for the period"
    },
    {
      "code": 6025,
      "name": "selfExcluded",
      "msg": "This wallet is self-excluded"
    },
    {
      "code": 6026,
      "name": "vaultShortfall",
      "msg": "The vault cannot cover this payment yet; the operator must top it up"
    },
    {
      "code": 6027,
      "name": "alreadyMigrated",
      "msg": "Config is already migrated"
    },
    {
      "code": 6028,
      "name": "notLegacyAccount",
      "msg": "Account is not a v2 account of this program"
    },
    {
      "code": 6029,
      "name": "legacyNotClosable",
      "msg": "The v2 draw still holds liabilities and cannot be closed"
    }
  ],
  "types": [
    {
      "name": "commonDrawParams",
      "docs": [
        "Parameters shared by both draw kinds."
      ],
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
      "name": "config",
      "docs": [
        "seeds = [b\"config\"]",
        "",
        "v3 layout. The v2 layout was `admin, next_draw_id, bump` (8 + 41 bytes, same discriminator);",
        "`migrate_config` reallocs a v2 Config into this layout."
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
              "Low-trust automation key: may create pot draws and request draws during the public-grace window."
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
      "name": "drawCancelled",
      "docs": [
        "reason: 0 = no tickets, 1 = randomness timeout, 2 = headline undersold (below min_tickets)"
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
            "name": "kind",
            "type": {
              "defined": {
                "name": "drawKind"
              }
            }
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
            "name": "prizeLamports",
            "docs": [
              "headline: escrowed prize; pot: 0"
            ],
            "type": "u64"
          },
          {
            "name": "minTickets",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "drawKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pot"
          },
          {
            "name": "headline"
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
            "name": "prize",
            "type": "u64"
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
      "name": "drawV3",
      "docs": [
        "seeds = [b\"draw3\", id.to_le_bytes()]"
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
              "config.admin at creation; receives the house share / returned escrow"
            ],
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "drawKind"
              }
            }
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
              "paid tickets (free and credit tickets never count)"
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
            "name": "prizeLamports",
            "docs": [
              "headline: fixed escrow; pot: 0 until settled (then the prize actually computed)"
            ],
            "type": "u64"
          },
          {
            "name": "minTickets",
            "docs": [
              "headline only"
            ],
            "type": "u32"
          },
          {
            "name": "floorMarginBps",
            "docs": [
              "headline only"
            ],
            "type": "u16"
          },
          {
            "name": "potLamports",
            "docs": [
              "pot draws: accumulated pot share"
            ],
            "type": "u64"
          },
          {
            "name": "instantPoolLamports",
            "docs": [
              "pot draws: current instant pool balance"
            ],
            "type": "u64"
          },
          {
            "name": "houseLamports",
            "type": "u64"
          },
          {
            "name": "houseWithdrawn",
            "type": "u64"
          },
          {
            "name": "revenueLamports",
            "docs": [
              "every lamport paid for tickets"
            ],
            "type": "u64"
          },
          {
            "name": "refundedLamports",
            "type": "u64"
          },
          {
            "name": "iwDenominator",
            "type": "u32"
          },
          {
            "name": "iwTiers",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "iwTierV3"
                  }
                },
                4
              ]
            }
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
            "name": "creditTickets",
            "type": "u32"
          },
          {
            "name": "nextTicket",
            "docs": [
              "ticket numbers are 0..next_ticket (all kinds)"
            ],
            "type": "u32"
          },
          {
            "name": "entryCount",
            "type": "u32"
          },
          {
            "name": "rolledEntries",
            "docs": [
              "entries that need a reveal (have an ORAO request)"
            ],
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
            "name": "prizePaidLamports",
            "type": "u64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "prizePaid",
            "docs": [
              "prize disbursed: to the winner (Settled) or the escrow back to the authority (Cancelled headline)"
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
            "name": "firstTicket",
            "type": "u32"
          },
          {
            "name": "count",
            "type": "u16"
          },
          {
            "name": "tiers",
            "type": {
              "array": [
                "u8",
                25
              ]
            }
          },
          {
            "name": "solPaid",
            "type": "u64"
          },
          {
            "name": "creditsWon",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "entryV3",
      "docs": [
        "seeds = [b\"entry3\", draw.key(), seq.to_le_bytes()] where seq = draw.entry_count at creation."
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
            "name": "firstTicket",
            "type": "u32"
          },
          {
            "name": "count",
            "docs": [
              "paid + credit (+1 for a free entry)"
            ],
            "type": "u16"
          },
          {
            "name": "paidCount",
            "type": "u16"
          },
          {
            "name": "creditCount",
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
            "name": "poolSnapshot",
            "docs": [
              "pot draws: `instant_pool_lamports` right after this purchase's contribution"
            ],
            "type": "u64"
          },
          {
            "name": "vrfRequest",
            "docs": [
              "ORAO randomness request PDA (default when the entry has no roll)"
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
            "name": "needsReveal",
            "type": "bool"
          },
          {
            "name": "revealed",
            "type": "bool"
          },
          {
            "name": "tiers",
            "docs": [
              "per ticket: 0 = no win, 1..=4 = tier index + 1"
            ],
            "type": {
              "array": [
                "u8",
                25
              ]
            }
          },
          {
            "name": "solPaid",
            "docs": [
              "instant SOL actually paid"
            ],
            "type": "u64"
          },
          {
            "name": "creditsWon",
            "type": "u32"
          },
          {
            "name": "refunded",
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
            "name": "ticket",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "headlineDrawParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "common",
            "type": {
              "defined": {
                "name": "commonDrawParams"
              }
            }
          },
          {
            "name": "prizeLamports",
            "type": "u64"
          },
          {
            "name": "minTickets",
            "type": "u32"
          },
          {
            "name": "floorMarginBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "iwTierV3",
      "docs": [
        "One instant-win tier. Unused = all zero."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "odds",
            "docs": [
              "winning outcomes out of `iw_denominator`"
            ],
            "type": "u32"
          },
          {
            "name": "kind",
            "docs": [
              "0 none, 1 sol_share, 2 credits"
            ],
            "type": "u8"
          },
          {
            "name": "value",
            "docs": [
              "sol_share: bps of the entry's pool snapshot; credits: free-ticket credits"
            ],
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
      "name": "playerV3",
      "docs": [
        "seeds = [b\"player3\", draw.key(), wallet]"
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
              "all kinds (paid + credit + free)"
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
            "name": "wonSol",
            "type": "u64"
          },
          {
            "name": "wonCredits",
            "type": "u32"
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
      "name": "potDrawParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "common",
            "type": {
              "defined": {
                "name": "commonDrawParams"
              }
            }
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
            "name": "iwDenominator",
            "docs": [
              "0 = no instant wins (all tiers must then be unused)"
            ],
            "type": "u32"
          },
          {
            "name": "iwTiers",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "iwTierV3"
                  }
                },
                4
              ]
            }
          }
        ]
      }
    },
    {
      "name": "profile",
      "docs": [
        "seeds = [b\"profile\", wallet]. Global across draws."
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
              "free-ticket credits (won as instant prizes, spent with `use_credits`)"
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
          },
          {
            "name": "credits",
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
            "name": "firstTicket",
            "type": "u32"
          },
          {
            "name": "count",
            "type": "u16"
          },
          {
            "name": "paidCount",
            "type": "u16"
          },
          {
            "name": "creditCount",
            "type": "u16"
          },
          {
            "name": "paidLamports",
            "type": "u64"
          },
          {
            "name": "potLamports",
            "docs": [
              "pot draws: the draw's pot / instant pool after this purchase"
            ],
            "type": "u64"
          },
          {
            "name": "instantPoolLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultV3",
      "docs": [
        "seeds = [b\"vault3\", draw.key()]. Program-owned, no fields: its lamports are everything the draw holds.",
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
