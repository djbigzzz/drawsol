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
    "version": "2.0.0",
    "spec": "0.1.0",
    "description": "DrawSol v2 - escrowed prize draw with ORAO VRF instant wins"
  },
  "instructions": [
    {
      "name": "buyTickets",
      "docs": [
        "Buys `quantity` tickets as one Entry and requests its ORAO randomness."
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
                  119
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "draw"
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
                  116
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
                  121
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "draw.entry_count",
                "account": "draw"
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
                  114
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
            "`vrf_request_address(seed)` in the handler and created by the ORAO CPI (`init`, so never reused)."
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
                  119
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "draw"
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
        "One free grand-draw ticket per wallet, up to `free_cap`."
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
                  119
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "draw"
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
                  121
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "draw.entry_count",
                "account": "draw"
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
                  114
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
          "name": "buyer",
          "docs": [
            "The claiming wallet (pays rent; becomes the entry owner)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimRefund",
      "docs": [
        "Permissionless. Refunds a paid entry of a cancelled draw to its owner."
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
                  119
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "draw"
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
                  116
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
                  121
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.seq",
                "account": "entry"
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
        "Admin only. Creates a Draw + Vault and escrows prize + instant-win reserve."
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
                  119
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
                  116
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
              "name": "createDrawParams"
            }
          }
        }
      ]
    },
    {
      "name": "initConfig",
      "docs": [
        "Creates the global Config. Signer must be the program's upgrade authority."
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
      "args": []
    },
    {
      "name": "requestDraw",
      "docs": [
        "Permissionless once due. Requests the grand-draw randomness (or cancels if nobody entered)."
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
                  119
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "draw"
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
                  116
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
            "Pays the ORAO fee."
          ],
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
      "name": "revealEntry",
      "docs": [
        "Permissionless. Computes the entry's instant results from fulfilled randomness and pays them."
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
                  119
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "draw"
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
                  116
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
                  121
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.seq",
                "account": "entry"
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
                  114
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "entry.owner",
                "account": "entry"
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
                  119
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "draw"
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
                  116
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
                  121
                ]
              },
              {
                "kind": "account",
                "path": "draw"
              },
              {
                "kind": "account",
                "path": "winning_entry.seq",
                "account": "entry"
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
        "Authority only. Withdraws proceeds / reserve leftovers / an unpaid prize when allowed."
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
                  119
                ]
              },
              {
                "kind": "account",
                "path": "draw.id",
                "account": "draw"
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
                  116
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
      "name": "draw",
      "discriminator": [
        225,
        131,
        41,
        222,
        122,
        20,
        146,
        202
      ]
    },
    {
      "name": "entry",
      "discriminator": [
        63,
        18,
        152,
        113,
        215,
        246,
        221,
        250
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
      "name": "player",
      "discriminator": [
        205,
        222,
        112,
        7,
        165,
        155,
        206,
        218
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
      "name": "freeEntryNoReveal",
      "msg": "Free entries have no instant result or refund"
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
      "name": "nothingToWithdraw",
      "msg": "Nothing to withdraw right now"
    },
    {
      "code": 6020,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "config",
      "docs": [
        "seeds = [b\"config\"]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
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
            "name": "prizeLamports",
            "type": "u64"
          },
          {
            "name": "iwReserveLamports",
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
                    "name": "iwTier"
                  }
                },
                4
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
      "name": "draw",
      "docs": [
        "seeds = [b\"draw\", id.to_le_bytes()]"
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
              "admin at creation; receives proceeds / leftovers"
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
            "docs": [
              "lamports"
            ],
            "type": "u64"
          },
          {
            "name": "ticketCap",
            "docs": [
              "paid tickets"
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
              "includes the free entry"
            ],
            "type": "u32"
          },
          {
            "name": "freeCap",
            "docs": [
              "max free tickets (separate from ticket_cap)"
            ],
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
            "name": "prizeLamports",
            "type": "u64"
          },
          {
            "name": "iwReserveLamports",
            "docs": [
              "escrowed instant-win budget"
            ],
            "type": "u64"
          },
          {
            "name": "iwPaidLamports",
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
                    "name": "iwTier"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "proceedsLamports",
            "docs": [
              "sum of paid ticket revenue"
            ],
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
            "name": "nextTicket",
            "docs": [
              "paid + free; ticket numbers are 0..next_ticket"
            ],
            "type": "u32"
          },
          {
            "name": "entryCount",
            "type": "u32"
          },
          {
            "name": "paidEntries",
            "type": "u32"
          },
          {
            "name": "revealedEntries",
            "docs": [
              "paid entries revealed"
            ],
            "type": "u32"
          },
          {
            "name": "drawVrfRequest",
            "docs": [
              "default until request_draw"
            ],
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
            "docs": [
              "copied at settlement for audit"
            ],
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
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "prizePaid",
            "type": "bool"
          },
          {
            "name": "proceedsWithdrawn",
            "type": "bool"
          },
          {
            "name": "reserveWithdrawn",
            "type": "bool"
          },
          {
            "name": "termsHash",
            "docs": [
              "sha256 of the published terms + skill question + odds"
            ],
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
      "name": "drawCancelled",
      "docs": [
        "reason: 0 = no tickets, 1 = randomness timeout"
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
            "name": "prizeLamports",
            "type": "u64"
          },
          {
            "name": "iwReserveLamports",
            "type": "u64"
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
            "name": "prizeLamports",
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
      "name": "entry",
      "docs": [
        "seeds = [b\"entry\", draw.key(), seq.to_le_bytes()] where seq = draw.entry_count at creation."
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
              "ORAO randomness request PDA (default for free entries)"
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
            "docs": [
              "free entries are created revealed (no instant roll)"
            ],
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
            "name": "instantPaid",
            "type": "u64"
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
            "name": "paid",
            "type": "u64"
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
      "name": "iwTier",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "docs": [
              "lamports paid per winning ticket"
            ],
            "type": "u64"
          },
          {
            "name": "odds",
            "docs": [
              "winning outcomes out of `iw_denominator`"
            ],
            "type": "u32"
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
      "name": "player",
      "docs": [
        "seeds = [b\"player\", draw.key(), wallet]"
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
              "paid + free"
            ],
            "type": "u32"
          },
          {
            "name": "spent",
            "type": "u64"
          },
          {
            "name": "won",
            "docs": [
              "instant wins paid"
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
            "name": "paidLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vault",
      "docs": [
        "seeds = [b\"vault\", draw.key()]. Program-owned, no fields: its lamports are the escrow",
        "(prize + instant-win reserve + ticket proceeds). Debited directly by the program; it must",
        "always stay rent-exempt."
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
