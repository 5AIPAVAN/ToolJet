import { QueryError } from 'src/modules/data_sources/query.errors';
import * as sanitizeHtml from 'sanitize-html';
import { EntityManager, getManager } from 'typeorm';
import { isEmpty } from 'lodash';
import { USER_TYPE } from './user_lifecycle';
import { EncryptionService } from '@services/encryption.service';
import { Credential } from 'src/entities/credential.entity';

export function parseJson(jsonString: string, errorMessage?: string): object {
  try {
    return JSON.parse(jsonString);
  } catch (err) {
    throw new QueryError(errorMessage, err.message, {});
  }
}
const protobuf = require('protobufjs');

export function maybeSetSubPath(path) {
  const hasSubPath = process.env.SUB_PATH !== undefined;
  const urlPrefix = hasSubPath ? process.env.SUB_PATH : '';

  if (isEmpty(urlPrefix)) {
    return path;
  }

  const pathWithoutLeadingSlash = path.replace(/^\/+/, '');
  return urlPrefix + pathWithoutLeadingSlash;
}

export async function cacheConnection(dataSourceId: string, connection: any): Promise<any> {
  const updatedAt = new Date();
  globalThis.CACHED_CONNECTIONS[dataSourceId] = { connection, updatedAt };
}

export async function getCachedConnection(dataSourceId, dataSourceUpdatedAt): Promise<any> {
  const cachedData = globalThis.CACHED_CONNECTIONS[dataSourceId] || {};

  if (cachedData) {
    const updatedAt = new Date(dataSourceUpdatedAt || null);
    const cachedAt = new Date(cachedData.updatedAt || null);

    const diffTime = (cachedAt.getTime() - updatedAt.getTime()) / 1000;

    if (diffTime < 0) {
      return null;
    } else {
      return cachedData['connection'];
    }
  }
}

export function cleanObject(obj: any): any {
  // This will remove undefined properties, for self and its children
  Object.keys(obj).forEach((key) => {
    obj[key] === undefined && delete obj[key];
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      cleanObject(obj[key]);
    }
  });
}

export function sanitizeInput(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'recursiveEscape',
  });
}

export function lowercaseString(value: string) {
  return value?.toLowerCase()?.trim();
}

export async function dbTransactionWrap(operation: (...args) => any, manager?: EntityManager): Promise<any> {
  if (manager) {
    return await operation(manager);
  } else {
    return await getManager().transaction(async (manager) => {
      return await operation(manager);
    });
  }
}

export const retrieveWhiteLabelText = () => {
  return process.env?.WHITE_LABEL_TEXT ? process.env.WHITE_LABEL_TEXT : 'ToolJet';
};

export const defaultAppEnvironments = [
  { name: 'production', isDefault: true },
  { name: 'staging', isDefault: false },
  { name: 'development', isDefault: false },
];

export const isSuperAdmin = (user) => {
  return !!(user?.userType === USER_TYPE.INSTANCE);
};

export function isPlural(data: Array<any>) {
  return data?.length > 1 ? 's' : '';
}

export function validateDefaultValue(value: any, params: any) {
  const { data_type } = params;
  if (data_type === 'boolean') return value || 'false';
  return value;
}

export async function dropForeignKey(tableName: string, columnName: string, queryRunner) {
  const table = await queryRunner.getTable(tableName);
  const foreignKey = table.foreignKeys.find((fk) => fk.columnNames.indexOf(columnName) !== -1);
  await queryRunner.dropForeignKey(tableName, foreignKey);
}

function convertToArrayOfKeyValuePairs(options): Array<object> {
  if (!options) return;
  return Object.keys(options).map((key) => {
    return {
      key: key,
      value: options[key]['value'],
      encrypted: options[key]['encrypted'],
      credential_id: options[key]['credential_id'],
    };
  });
}

export async function filterEncryptedFromOptions(
  options: Array<object>,
  encryptionService: EncryptionService,
  entityManager: EntityManager
) {
  const kvOptions = convertToArrayOfKeyValuePairs(options);

  if (!kvOptions) return;

  const parsedOptions = {};

  for (const option of kvOptions) {
    if (option['encrypted']) {
      const credential = await createCredential('', encryptionService, entityManager);

      parsedOptions[option['key']] = {
        credential_id: credential.id,
        encrypted: option['encrypted'],
      };
    } else {
      parsedOptions[option['key']] = {
        value: option['value'],
        encrypted: false,
      };
    }
  }

  return parsedOptions;
}

async function createCredential(
  value: string,
  encryptionService: EncryptionService,
  entityManager: EntityManager
): Promise<Credential> {
  const credentialRepository = entityManager.getRepository(Credential);
  const newCredential = credentialRepository.create({
    valueCiphertext: await encryptionService.encryptColumnValue('credentials', 'value', value),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const credential = await credentialRepository.save(newCredential);
  return credential;
}
export async function getServiceAndRpcNames(protoDefinition) {
  const root = protobuf.parse(protoDefinition).root;
  const serviceNamesAndMethods = root.nestedArray
    .filter((item) => item instanceof protobuf.Service)
    .reduce((acc, service) => {
      const rpcMethods = service.methodsArray.map((method) => method.name);
      acc[service.name] = rpcMethods;
      return acc;
    }, {});
  return serviceNamesAndMethods;
}
