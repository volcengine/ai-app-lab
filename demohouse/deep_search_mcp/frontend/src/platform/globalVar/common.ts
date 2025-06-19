export enum ArkAppNames {
  Ark = 'ark',
  ArkBoe = 'ark-boe',
  ArkStg = 'ark-stg',
}

export enum ArkServiceCodeNames {
  Ark = 'ark',
  ArkBoe = 'ark_boe',
  ArkStg = 'ark_stg',
}

export enum ServiceSuffix {
  Boe = '-boe',
  Stg = '-stg',
  Prod = '',
}

export enum BUILD_ENV {
  Boe = 'boe',
  Stg = 'stg',
  Online = 'online',
}

export const buildEnvMap: Record<BUILD_ENV, ArkAppNames> = {
  [BUILD_ENV.Boe]: ArkAppNames.ArkBoe,
  [BUILD_ENV.Stg]: ArkAppNames.ArkStg,
  [BUILD_ENV.Online]: ArkAppNames.Ark,
};

export const serviceNameMap: Record<string, string> = {
  [ArkAppNames.Ark]: ArkServiceCodeNames.Ark,
  [ArkAppNames.ArkBoe]: ArkServiceCodeNames.ArkBoe,
  [ArkAppNames.ArkStg]: ArkServiceCodeNames.ArkStg,
};

export const IS_DEV = process.env.NODE_ENV === 'development';

export const AutoPEApiVersion = '2024-01-01';
