// Frozen schema identities accepted by portable backup validation.
export const backupSchemaIdentities: Record<
  number,
  {
    platform_schema_version: number;
    model_signature: string;
    schema_signature: string;
  }
> = {
  '1': {
    platform_schema_version: 1,
    model_signature:
      'ede94ec37ae87796c84a270a2a8da3ffd1991994cbc114e72abd18313c5f3add',
    schema_signature:
      '643cd0c88b0525bddcdef7ce0cc384a655541db85be083e590a34b0ce125cf92',
  },
  '2': {
    platform_schema_version: 2,
    model_signature:
      '968fdebb6e9029c5d826f1acc2db02e8b1b1c8d16615533e2ba6975daf20fa72',
    schema_signature:
      '92abfeca0aa4531abc65bb51171db0620d8ee2c3b4d161f0f2e531896525264f',
  },
  '3': {
    platform_schema_version: 3,
    model_signature:
      'c83d072e7f1bbff93669dfa1114ac6ad8b0cd4bd0b5a9c61256b6432ba263204',
    schema_signature:
      '52f0f56ac70877e35d69af0c104e3ac38e4fd3a3cc3819976ad89e3c58cd55b1',
  },
  '4': {
    platform_schema_version: 4,
    model_signature:
      'f87ccaa6e53e9a975ca25c8215dddd418900ac8c24370799f33cd3860efc973d',
    schema_signature:
      'bed6850a372e4e208f56326de92dd784cb78ef009689519215706cb850a96f09',
  },
  '5': {
    platform_schema_version: 5,
    model_signature:
      '632024721991a6f497272ff0d8e73f120705fa3f8ff279e0b0729e8a29ea4510',
    schema_signature:
      '70f7d5ad6dbc652be20b6611834b1a85f3613de4b02cfd7487c22b3eff80defe',
  },
  '6': {
    platform_schema_version: 6,
    model_signature:
      '36a056d575aef79247d83fe099cc71e50e41c60bad5bf0df47e3a476c0cf94ec',
    schema_signature:
      '9926ba6337ccfa0b49d564ffb7813268b0df6ca9a181debb469a327c1302d8a6',
  },
  '7': {
    platform_schema_version: 7,
    model_signature:
      'ee4c749817e5ecf76008cc82ca26a33b8aeae3665d4c8fe369d77e54466ce5f2',
    schema_signature:
      'a3bebfe86f7c285aef4f9a09e4b09aca6f77b5a640760bb3a4fee1643f1f2174',
  },
  '8': {
    platform_schema_version: 8,
    model_signature:
      '76a163a1db237f866c831e7deb1cea881ffd5b99045ccaeaef6c9d244ac3bbb4',
    schema_signature:
      '0b5518b2ebc83fa8bcd53b9c298cb7e2a3cd487f2ba8bd67a2681ce7ee319899',
  },
  '9': {
    platform_schema_version: 9,
    model_signature:
      '76a163a1db237f866c831e7deb1cea881ffd5b99045ccaeaef6c9d244ac3bbb4',
    schema_signature:
      '281c91ff5487187979c63c5867761c67153d26cc28c63ba4df906763ed18116c',
  },
};
