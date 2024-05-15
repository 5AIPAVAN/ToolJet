import { BadRequestException, ConflictException, Injectable, NotAcceptableException } from '@nestjs/common';
import * as csv from 'fast-csv';
import { InjectRepository } from '@nestjs/typeorm';
import { GroupPermission } from 'src/entities/group_permission.entity';
import { Organization } from 'src/entities/organization.entity';
import { ConfigScope, SSOConfigs, SSOType } from 'src/entities/sso_config.entity';
import { User } from 'src/entities/user.entity';
import {
  cleanObject,
  dbTransactionWrap,
  isPlural,
  generatePayloadForLimits,
  catchDbException,
  isSuperAdmin,
  fullName,
  generateNextNameAndSlug,
} from 'src/helpers/utils.helper';
import {
  Brackets,
  createQueryBuilder,
  DeepPartial,
  EntityManager,
  FindManyOptions,
  getManager,
  ILike,
  Repository,
} from 'typeorm';
import { OrganizationUser } from '../entities/organization_user.entity';
import { EmailService } from './email.service';
import { EncryptionService } from './encryption.service';
import { GroupPermissionsService } from './group_permissions.service';
import { OrganizationUsersService } from './organization_users.service';
import { DataSourcesService } from './data_sources.service';
import { UsersService } from './users.service';
import { InviteNewUserDto } from '@dto/invite-new-user.dto';
import { ConfigService } from '@nestjs/config';
import { ActionTypes, ResourceTypes } from 'src/entities/audit_log.entity';
import { AuditLoggerService } from './audit_logger.service';
import {
  getUserStatusAndSource,
  lifecycleEvents,
  USER_STATUS,
  USER_TYPE,
  WORKSPACE_USER_STATUS,
  WORKSPACE_STATUS,
} from 'src/helpers/user_lifecycle';
import { InstanceSettingsService } from './instance_settings.service';
import { decamelize } from 'humps';
import { Response } from 'express';
import { AppEnvironmentService } from './app_environments.service';
import { LicenseService } from './license.service';
import { LICENSE_FIELD, LICENSE_LIMIT, LICENSE_LIMITS_LABEL } from 'src/helpers/license.helper';
import { DataBaseConstraints } from 'src/helpers/db_constraints.constants';
import { OrganizationUpdateDto } from '@dto/organization.dto';
import { INSTANCE_SYSTEM_SETTINGS, INSTANCE_USER_SETTINGS } from 'src/helpers/instance_settings.constants';
import { IsNull } from 'typeorm';
import { DataSourceScopes, DataSourceTypes } from 'src/helpers/data_source.constants';
import { DataSource } from 'src/entities/data_source.entity';
import { AppEnvironment } from 'src/entities/app_environments.entity';
import { DataSourceOptions } from 'src/entities/data_source_options.entity';

const MAX_ROW_COUNT = 500;

type FetchUserResponse = {
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  id: string;
  status: string;
  invitationToken?: string;
  accountSetupToken?: string;
};

type UserFilterOptions = { searchText?: string; status?: string };

interface UserCsvRow {
  first_name: string;
  last_name: string;
  email: string;
  groups?: any;
}

interface SSOConfig {
  enabled: boolean;
  configs: any; // Replace 'any' with a more specific type if possible
}

export interface InstanceSSOConfigMap {
  google?: SSOConfig;
  git?: SSOConfig;
  openid?: SSOConfig;
  form?: SSOConfig;
}

const orgConstraints = [
  {
    dbConstraint: DataBaseConstraints.WORKSPACE_NAME_UNIQUE,
    message: 'This workspace name is already taken.',
  },
  {
    dbConstraint: DataBaseConstraints.WORKSPACE_SLUG_UNIQUE,
    message: 'This workspace slug is already taken.',
  },
];

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private organizationsRepository: Repository<Organization>,
    @InjectRepository(SSOConfigs)
    private ssoConfigRepository: Repository<SSOConfigs>,
    private usersService: UsersService,
    private dataSourceService: DataSourcesService,
    private organizationUserService: OrganizationUsersService,
    private groupPermissionService: GroupPermissionsService,
    private appEnvironmentService: AppEnvironmentService,
    private encryptionService: EncryptionService,
    private emailService: EmailService,
    private instanceSettingsService: InstanceSettingsService,
    private configService: ConfigService,
    private auditLoggerService: AuditLoggerService,
    private licenseService: LicenseService
  ) {}

  async create(name: string, slug: string, user: User, manager?: EntityManager): Promise<Organization> {
    let organization: Organization;
    await dbTransactionWrap(async (manager: EntityManager) => {
      organization = await catchDbException(async () => {
        return await manager.save(
          manager.create(Organization, {
            ssoConfigs: [
              {
                sso: SSOType.FORM,
                enabled: true,
                configScope: ConfigScope.ORGANIZATION,
              },
            ],
            name,
            slug,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        );
      }, orgConstraints);

      await this.appEnvironmentService.createDefaultEnvironments(organization.id, manager);

      const createdGroupPermissions: GroupPermission[] = await this.createDefaultGroupPermissionsForOrganization(
        organization,
        manager
      );

      if (user) {
        await this.organizationUserService.create(user, organization, false, manager);

        for (const groupPermission of createdGroupPermissions) {
          await this.groupPermissionService.createUserGroupPermission(user.id, groupPermission.id, manager);
        }

        await this.usersService.validateLicense(manager);
      }
      await this.createSampleDB(organization.id, manager);
      await this.organizationUserService.validateLicense(manager);
    }, manager);

    return organization;
  }

  async constructSSOConfigs() {
    const isPersonalWorkspaceAllowed = await this.instanceSettingsService.getSettings(
      INSTANCE_USER_SETTINGS.ALLOW_PERSONAL_WORKSPACE
    );
    const oidcIncluded = await this.licenseService.getLicenseTerms(LICENSE_FIELD.OIDC);
    const ssoConfigs = await this.getInstanceSSOConfigs();
    const enableSignUp = await this.instanceSettingsService.getSettings(INSTANCE_SYSTEM_SETTINGS.ENABLE_SIGNUP);

    // Create a map from the ssoConfigs array
    const ssoConfigMap: InstanceSSOConfigMap = {};
    ssoConfigs.forEach((config) => {
      ssoConfigMap[config.sso] = {
        enabled: config.enabled,
        configs: config.configs,
      };
    });

    const isExpired = await this.licenseService.getLicenseTerms(LICENSE_FIELD.IS_EXPIRED);
    const isBasicPlan = await this.licenseService.isBasicPlan();
    const banner_message = `OpenID connect ${
      isExpired || isBasicPlan ? 'is available only in paid plans' : 'is not included in your current plan'
    }. For more, contact super admin`;

    return {
      google: {
        enabled: ssoConfigMap?.google?.enabled || false,
        configs: ssoConfigMap?.google?.configs || {},
      },
      git: {
        enabled: ssoConfigMap?.git?.enabled || false,
        configs: ssoConfigMap?.git?.configs || {},
      },
      openid: {
        enabled: ssoConfigMap?.openid?.enabled || false,
        configs: ssoConfigMap?.openid?.configs || {},
        featureIncluded: !!oidcIncluded,
        ...(!oidcIncluded ? { banner_message } : {}),
      },
      form: {
        enable_sign_up: enableSignUp === 'true' && isPersonalWorkspaceAllowed === 'true',
        enabled: isExpired || isBasicPlan || ssoConfigMap?.form?.enabled || false,
      },
      enableSignUp: enableSignUp === 'true' && isPersonalWorkspaceAllowed === 'true',
    };
  }

  async get(id: string): Promise<Organization> {
    return await this.organizationsRepository.findOne({ where: { id }, relations: ['ssoConfigs'] });
  }

  async getInstanceSSOConfigs(decryptSensitiveData = true): Promise<SSOConfigs[]> {
    const result = await dbTransactionWrap(async (manager: EntityManager) => {
      return await manager.find(SSOConfigs, {
        where: {
          organizationId: IsNull(),
        },
      });
    });
    if (!(result.length > 0)) {
      return result;
    }
    if (decryptSensitiveData) {
      for (const sso of result) {
        await this.decryptSecret(sso?.configs);
      }
    }
    return result;
  }

  async updateInstanceSSOConfigs(params: any): Promise<SSOConfigs> {
    //can't do an upsert because entity includes only partial unique constraints
    return await dbTransactionWrap(async (manager: EntityManager) => {
      const { type, configs, enabled } = params;
      await this.encryptSecret(configs);
      const updatableParams = {
        configs,
        enabled,
        updatedAt: new Date(),
      };
      cleanObject(updatableParams);

      let ssoConfig = await manager.findOne(SSOConfigs, {
        where: {
          sso: type,
          organizationId: null,
          configScope: ConfigScope.INSTANCE,
        },
      });

      if (ssoConfig) {
        ssoConfig = { ...ssoConfig, ...updatableParams };
      } else {
        ssoConfig = manager.create(SSOConfigs, {
          organizationId: null,
          sso: type,
          configScope: ConfigScope.INSTANCE,
          ...updatableParams,
        });
      }

      // Save the record (insert or update)
      const savedConfig = await manager.save(SSOConfigs, ssoConfig);
      return savedConfig;
    });
  }

  async fetchOrganization(slug: string, manager?: EntityManager): Promise<Organization> {
    return dbTransactionWrap(async (manager: EntityManager) => {
      let organization: Organization;
      try {
        organization = await manager.findOneOrFail(Organization, {
          where: { slug },
          select: ['id', 'slug', 'name', 'status'],
        });
      } catch (error) {
        organization = await manager.findOneOrFail(Organization, {
          where: { id: slug },
          select: ['id', 'slug', 'name', 'status'],
        });
      }
      if (organization && organization.status !== WORKSPACE_STATUS.ACTIVE)
        throw new BadRequestException('Organization is Archived');
      return organization;
    }, manager);
  }

  async getSingleOrganization(): Promise<Organization> {
    return await this.organizationsRepository.findOne({ relations: ['ssoConfigs'] });
  }

  async createDefaultGroupPermissionsForOrganization(organization: Organization, manager?: EntityManager) {
    const defaultGroups = ['all_users', 'admin'];

    return await dbTransactionWrap(async (manager: EntityManager) => {
      const createdGroupPermissions: GroupPermission[] = [];
      for (const group of defaultGroups) {
        const isAdmin = group === 'admin';
        const groupPermission = manager.create(GroupPermission, {
          organizationId: organization.id,
          group: group,
          appCreate: isAdmin,
          appDelete: isAdmin,
          folderCreate: isAdmin,
          orgEnvironmentVariableCreate: isAdmin,
          orgEnvironmentVariableUpdate: isAdmin,
          orgEnvironmentVariableDelete: isAdmin,
          orgEnvironmentConstantCreate: isAdmin,
          orgEnvironmentConstantDelete: isAdmin,
          folderUpdate: isAdmin,
          folderDelete: isAdmin,
          dataSourceDelete: isAdmin,
          dataSourceCreate: isAdmin,
        });
        await manager.save(groupPermission);
        createdGroupPermissions.push(groupPermission);
      }
      return createdGroupPermissions;
    }, manager);
  }

  async fetchUsersByValue(user: User, searchInput: string): Promise<any> {
    if (!searchInput) {
      return [];
    }
    const options = {
      searchText: searchInput,
    };
    const organizationUsers = await this.organizationUsersQuery(user.organizationId, options, 'or', true)
      .distinctOn(['user.email'])
      .orderBy('user.email', 'ASC')
      .take(10)
      .getMany();

    return organizationUsers?.map((orgUser) => {
      return {
        email: orgUser.user.email,
        firstName: orgUser.user?.firstName,
        lastName: orgUser.user?.lastName,
        name: `${orgUser.user?.firstName} ${orgUser.user?.lastName}`,
        id: orgUser.id,
        userId: orgUser.user.id,
      };
    });
  }

  organizationUsersQuery(
    organizationId: string,
    options: UserFilterOptions,
    condition?: 'and' | 'or',
    getSuperAdmin?: boolean
  ) {
    const defaultConditions = () => {
      return new Brackets((qb) => {
        if (options?.searchText)
          qb.orWhere('lower(user.email) like :email', {
            email: `%${options?.searchText.toLowerCase()}%`,
          });
        if (options?.searchText)
          qb.orWhere('lower(user.firstName) like :firstName', {
            firstName: `%${options?.searchText.toLowerCase()}%`,
          });
        if (options?.searchText)
          qb.orWhere('lower(user.lastName) like :lastName', {
            lastName: `%${options?.searchText.toLowerCase()}%`,
          });
      });
    };

    const getOrConditions = () => {
      return new Brackets((qb) => {
        if (options?.status)
          qb.orWhere('organization_user.status = :status', {
            status: `${options?.status}`,
          });
      });
    };
    const getAndConditions = () => {
      return new Brackets((qb) => {
        if (options?.status)
          qb.andWhere('organization_user.status = :status', {
            status: `${options?.status}`,
          });
      });
    };
    const query = createQueryBuilder(OrganizationUser, 'organization_user')
      .innerJoinAndSelect('organization_user.user', 'user')
      .innerJoinAndSelect(
        'user.groupPermissions',
        'group_permissions',
        'group_permissions.organization_id = :organizationId',
        {
          organizationId: organizationId,
        }
      )
      .where('organization_user.organization_id = :organizationId', {
        organizationId,
      });

    if (getSuperAdmin) {
      query.andWhere(
        new Brackets((qb) => {
          qb.orWhere('organization_user.organization_id = :organizationId', {
            organizationId,
          }).orWhere('user.userType = :userType', {
            userType: USER_TYPE.INSTANCE,
          });
        })
      );
    } else {
      query.andWhere('organization_user.organization_id = :organizationId', {
        organizationId,
      });
    }

    query.andWhere(defaultConditions()).andWhere(condition === 'and' ? getAndConditions() : getOrConditions());
    return query;
  }

  async fetchUsers(user: User, page = 1, options: UserFilterOptions): Promise<FetchUserResponse[]> {
    const condition = options?.searchText ? 'and' : 'or';
    const organizationUsers = await this.organizationUsersQuery(user.organizationId, options, condition)
      .orderBy('user.firstName', 'ASC')
      .take(10)
      .skip(10 * (page - 1))
      .getMany();

    return organizationUsers?.map((orgUser) => {
      return {
        email: orgUser.user.email,
        firstName: orgUser.user.firstName ?? '',
        lastName: orgUser.user.lastName ?? '',
        name: fullName(orgUser.user.firstName, orgUser.user.lastName),
        id: orgUser.id,
        userId: orgUser.user.id,
        role: orgUser.role,
        status: orgUser.status,
        avatarId: orgUser.user.avatarId,
        groups: orgUser.user.groupPermissions.map((groupPermission) => groupPermission.group),
        ...(orgUser.invitationToken ? { invitationToken: orgUser.invitationToken } : {}),
        ...(this.configService.get<string>('HIDE_ACCOUNT_SETUP_LINK') !== 'true' && orgUser.user.invitationToken
          ? { accountSetupToken: orgUser.user.invitationToken }
          : {}),
      };
    });
  }

  async usersCount(user: User, options: UserFilterOptions): Promise<number> {
    const condition = options?.searchText ? 'and' : 'or';
    return await this.organizationUsersQuery(user.organizationId, options, condition).getCount();
  }

  async fetchOrganizations(
    user: any,
    status = 'active',
    currentPage?: number,
    perPageCount?: number,
    name?: string
  ): Promise<{ organizations: Organization[]; totalCount: number }> {
    /**
     * Asynchronous function to fetch organizations based on specified parameters.
     *
     * @param user - The user making the request. If the user is a Super Admin, all organizations are accessible; otherwise, only organizations associated with the user are retrieved.
     * @param status - Optional parameter specifying the status of organizations to retrieve (default: 'active').
     * @param currentPage - Optional parameter specifying the current page number for paginated results.
     * @param perPageCount - Optional parameter specifying the number of organizations to fetch per page.
     * @param name - Optional parameter to filter organizations by name.
     *
     * @returns A Promise containing an object with two properties:
     *   - organizations: An array of Organization objects based on the specified criteria.
     *   - totalCount: The total count of organizations that match the criteria.
     *
     * @throws An error if the function encounters issues during database queries or data retrieval.
     */
    if (isSuperAdmin(user)) {
      const findOptions: FindManyOptions<Organization> = {
        order: { name: 'ASC' },
        where: {
          status: status,
          /* Adding optional like filter for name */
          ...(name ? { name: ILike(`%${name}%`) } : {}),
        },
      };

      /* Adding pagination in API using current page and page per count  */
      if (currentPage && perPageCount > 0) {
        findOptions.skip = (currentPage - 1) * perPageCount;
        findOptions.take = perPageCount;
      }

      /* Returning both all organizations and total count of organization that matches the given status and name condition   */
      const [organizations, totalCount] = await this.organizationsRepository.findAndCount(findOptions);
      return { organizations, totalCount };
    } else {
      let query = createQueryBuilder(Organization, 'organization')
        .innerJoin(
          'organization.organizationUsers',
          'organization_users',
          'organization_users.status IN(:...statusList)',
          {
            statusList: ['active'],
          }
        )
        .andWhere('organization_users.userId = :userId', {
          userId: user.id,
        })
        .andWhere('organization.status = :status', {
          status,
        });

      if (name) {
        query = query.andWhere('organization.name ILIKE :name', {
          name: `%${name}%`,
        });
      }
      query = query.orderBy('name', 'ASC');

      /* wrapping two different promises for optimization */
      const [organizations, totalCount] = await Promise.all([
        (async () => {
          if (currentPage && perPageCount > 0) {
            const skipCount = (currentPage - 1) * perPageCount;
            query = query.take(perPageCount).skip(skipCount);
          }
          return await query.getMany();
        })(),
        query.getCount(),
      ]);

      return { organizations, totalCount };
    }
  }

  async findOrganizationWithLoginSupport(
    user: User,
    loginType: string,
    status?: string | Array<string>
  ): Promise<Organization[]> {
    const statusList = status ? (typeof status === 'object' ? status : [status]) : [WORKSPACE_USER_STATUS.ACTIVE];

    const query = createQueryBuilder(Organization, 'organization')
      .innerJoin('organization.ssoConfigs', 'organization_sso', 'organization_sso.sso = :form', {
        form: 'form',
      })
      .innerJoin(
        'organization.organizationUsers',
        'organization_users',
        'organization_users.status IN(:...statusList)',
        {
          statusList,
        }
      );

    if (!isSuperAdmin(user)) {
      if (loginType === 'form') {
        query.where('organization_sso.enabled = :enabled', {
          enabled: true,
        });
      } else if (loginType === 'sso') {
        query.where('organization.inheritSSO = :inheritSSO', {
          inheritSSO: true,
        });
      } else {
        return;
      }
    }

    query.andWhere('organization_users.userId = :userId', {
      userId: user.id,
    });

    return await query.orderBy('name', 'ASC').getMany();
  }

  async getSSOConfigs(organizationId: string, sso: string): Promise<Organization> {
    return await createQueryBuilder(Organization, 'organization')
      .leftJoinAndSelect('organization.ssoConfigs', 'organisation_sso', 'organisation_sso.sso = :sso', {
        sso,
      })
      .andWhere('organization.id = :organizationId', {
        organizationId,
      })
      .getOne();
  }

  constructOrgFindQuery(slug: string, id: string, statusList?: Array<boolean>) {
    const query = createQueryBuilder(Organization, 'organization').leftJoinAndSelect(
      'organization.ssoConfigs',
      'organisation_sso',
      'organisation_sso.enabled IN (:...statusList)',
      {
        statusList: statusList || [true, false], // Return enabled and disabled sso if status list not passed
      }
    );
    if (slug) {
      query.andWhere(`organization.slug = :slug`, { slug });
    } else {
      query.andWhere(`organization.id = :id`, { id });
    }
    return query;
  }

  async fetchOrganizationDetails(
    organizationId: string,
    statusList?: Array<boolean>,
    isHideSensitiveData?: boolean,
    addInstanceLevelSSO?: boolean
  ): Promise<DeepPartial<Organization>> {
    let result: DeepPartial<Organization>;
    try {
      result = await this.constructOrgFindQuery(organizationId, null, statusList).getOneOrFail();
    } catch (error) {
      result = await this.constructOrgFindQuery(null, organizationId, statusList).getOne();
    }
    const ssoConfigs = await this.getInstanceSSOConfigs(false);
    const isBasicPlan = await this.licenseService.isBasicPlan();
    const isEnableWorkspaceLoginConfiguration =
      (await this.instanceSettingsService.getSettings(
        INSTANCE_SYSTEM_SETTINGS.ENABLE_WORKSPACE_LOGIN_CONFIGURATION
      )) === 'true';

    // Create a map from the ssoConfigs array
    const ssoConfigMap: InstanceSSOConfigMap = {};
    ssoConfigs.forEach((config) => {
      ssoConfigMap[config.sso] = {
        enabled: config.enabled,
        configs: config.configs,
      };
    });

    if (!result) return;

    if (isBasicPlan) {
      result.ssoConfigs.forEach((config) => config.sso === 'form' && (config.enabled = true));
    }

    if (!isEnableWorkspaceLoginConfiguration) {
      result.ssoConfigs = [];
      if (ssoConfigMap?.form?.enabled === true || isBasicPlan) {
        result.ssoConfigs.push({
          sso: SSOType.FORM,
          enabled: true,
        });
      }
      if (ssoConfigMap?.google?.enabled === true) {
        result.ssoConfigs.push({
          sso: SSOType.GOOGLE,
          enabled: true,
          configs: ssoConfigMap?.google?.configs || {},
        });
      }
      if (ssoConfigMap?.git?.enabled === true) {
        result.ssoConfigs.push({
          sso: SSOType.GIT,
          enabled: true,
          configs: ssoConfigMap?.git?.configs || {},
        });
      }
      if (ssoConfigMap?.openid?.enabled === true) {
        result.ssoConfigs.push({
          sso: SSOType.OPENID,
          enabled: true,
          configs: ssoConfigMap?.openid?.configs || {},
        });
      }
    }

    if (addInstanceLevelSSO && result.inheritSSO && isEnableWorkspaceLoginConfiguration) {
      if (ssoConfigMap?.google?.enabled === true && !result.ssoConfigs?.some((config) => config.sso === 'google')) {
        if (!result.ssoConfigs) {
          result.ssoConfigs = [];
        }
        result.ssoConfigs.push({
          sso: SSOType.GOOGLE,
          enabled: true,
          configs: ssoConfigMap?.google?.configs || {},
        });
      }
      if (ssoConfigMap?.git?.enabled === true && !result.ssoConfigs?.some((config) => config.sso === 'git')) {
        if (!result.ssoConfigs) {
          result.ssoConfigs = [];
        }
        result.ssoConfigs.push({
          sso: SSOType.GIT,
          enabled: true,
          configs: ssoConfigMap?.git?.configs || {},
        });
      }
      if (ssoConfigMap?.openid?.enabled === true && !result.ssoConfigs?.some((config) => config.sso === 'openid')) {
        if (!result.ssoConfigs) {
          result.ssoConfigs = [];
        }
        result.ssoConfigs.push({
          sso: SSOType.OPENID,
          enabled: true,
          configs: ssoConfigMap?.openid?.configs || {},
        });
      }
    }

    result.ssoConfigs = await this.cycleThroughOrganizationConfigs(result.ssoConfigs);

    if (!isHideSensitiveData) {
      if (!(result?.ssoConfigs?.length > 0)) {
        return;
      }
      for (const sso of result?.ssoConfigs) {
        await this.decryptSecret(sso?.configs);
      }
      return result;
    }
    return this.hideSSOSensitiveData(result?.ssoConfigs, result?.name, result?.enableSignUp, result.id);
  }

  private cycleThroughOrganizationConfigs = async (ssoConfigs: any) => {
    const filteredConfigs: SSOConfigs[] = [];

    const licenseTerms = await this.licenseService.getLicenseTerms([
      LICENSE_FIELD.OIDC,
      LICENSE_FIELD.LDAP,
      LICENSE_FIELD.SAML,
      LICENSE_FIELD.IS_EXPIRED,
    ]);
    const isBasicPlan = await this.licenseService.isBasicPlan();
    const isExpired = licenseTerms[LICENSE_FIELD.IS_EXPIRED];

    ssoConfigs.map((config) => {
      const copiedConfig = config;
      const sso: string = copiedConfig.sso;
      const paidSSOs = {
        openid: {
          label: 'OpenID connect',
          licenseTerm: LICENSE_FIELD.OIDC,
        },
        saml: { label: 'SAML', licenseTerm: LICENSE_FIELD.SAML },
        ldap: { label: 'LDAP', licenseTerm: LICENSE_FIELD.LDAP },
      };

      if (Object.keys(paidSSOs).includes(sso)) {
        const ssoType = paidSSOs[sso];
        const { label, licenseTerm } = ssoType;
        if (!licenseTerms[licenseTerm]) {
          const bannerMessage = `${label} ${
            isExpired || isBasicPlan ? 'is available only in paid plans' : 'is not included in your current plan'
          }. For more, contact super admin`;
          copiedConfig.configs = {
            name: copiedConfig?.configs?.name,
          };
          copiedConfig.bannerMessage = bannerMessage;
        }
        copiedConfig.featureIncluded = !!licenseTerms[licenseTerm];
      }
      filteredConfigs.push(copiedConfig);
    });

    return filteredConfigs;
  };

  private hideSSOSensitiveData(
    ssoConfigs: DeepPartial<SSOConfigs>[],
    organizationName: string,
    enableSignUp: boolean,
    organizationId: string
  ): any {
    const configs = { name: organizationName, enableSignUp, id: organizationId };
    if (ssoConfigs?.length > 0) {
      for (const config of ssoConfigs) {
        const configId = config['id'];
        delete config['id'];
        delete config['organizationId'];
        delete config['createdAt'];
        delete config['updatedAt'];

        configs[config.sso] = this.buildConfigs(config, configId);
      }
    }
    return configs;
  }

  private buildConfigs(config: any, configId: string) {
    if (!config) return config;
    return {
      ...config,
      configs: {
        ...(config?.configs || {}),
        ...(config?.configs ? { clientSecret: '' } : {}),
      },
      configId,
    };
  }

  private async encryptSecret(configs) {
    if (!configs || typeof configs !== 'object') return configs;
    await Promise.all(
      Object.keys(configs).map(async (key) => {
        if (key.toLowerCase().includes('secret')) {
          if (configs[key]) {
            configs[key] = await this.encryptionService.encryptColumnValue('ssoConfigs', key, configs[key]);
          }
        }
        if (key.toLowerCase().includes('sslCerts')) {
          if (typeof configs[key] === 'object' && Object.keys(configs[key]).length) {
            const sslCerts = {};
            for (const k of Object.keys(configs[key])) {
              try {
                sslCerts[k] = await this.encryptionService.encryptColumnValue('ssoConfigs', k, configs[key][k]);
              } catch (error) {
                sslCerts[k] = configs[key][k];
              }
            }
            configs[key] = sslCerts;
          }
        }
      })
    );
  }

  private async decryptSecret(configs) {
    if (!configs || typeof configs !== 'object') return configs;
    await Promise.all(
      Object.keys(configs).map(async (key) => {
        if (key.toLowerCase().includes('secret')) {
          if (configs[key]) {
            configs[key] = await this.encryptionService.decryptColumnValue('ssoConfigs', key, configs[key]);
          }
        }
        if (key.toLowerCase().includes('sslCerts')) {
          if (typeof configs[key] === 'object' && Object.keys(configs[key]).length) {
            const sslCerts = {};
            for (const k of Object.keys(configs[key])) {
              try {
                sslCerts[k] = await this.encryptionService.decryptColumnValue('ssoConfigs', k, configs[key][k]);
              } catch (error) {
                sslCerts[k] = configs[key][k];
              }
            }
            configs[key] = sslCerts;
          }
        }
      })
    );
  }

  async updateOrganization(organizationId: string, params: OrganizationUpdateDto) {
    const { name, slug, domain, enableSignUp, inheritSSO, status } = params;

    const updatableParams = {
      name,
      slug,
      domain,
      enableSignUp,
      inheritSSO,
      status,
    };

    // removing keys with undefined values
    cleanObject(updatableParams);
    return await dbTransactionWrap(async (manager: EntityManager) => {
      await catchDbException(async () => {
        await manager.update(Organization, organizationId, updatableParams);
      }, orgConstraints);
      await this.usersService.validateLicense(manager);
    });
  }

  async updateOrganizationConfigs(organizationId: string, params: any) {
    const { type, configs, enabled } = params;

    if (!(type && ['git', 'google', 'form', 'openid', 'ldap', 'saml'].includes(type))) {
      throw new BadRequestException();
    }

    await this.encryptSecret(configs);
    const organization: Organization = await this.getSSOConfigs(organizationId, type);

    if (organization?.ssoConfigs?.length > 0) {
      const ssoConfigs: SSOConfigs = organization.ssoConfigs[0];

      const updatableParams = {
        configs,
        enabled,
      };

      // removing keys with undefined values
      cleanObject(updatableParams);
      return await this.ssoConfigRepository.update(ssoConfigs.id, updatableParams);
    } else {
      const newSSOConfigs = this.ssoConfigRepository.create({
        organization,
        sso: type,
        configs,
        enabled: !!enabled,
        configScope: ConfigScope.ORGANIZATION,
      });
      return await this.ssoConfigRepository.save(newSSOConfigs);
    }
  }

  async getConfigs(id: string): Promise<SSOConfigs> {
    const result: SSOConfigs = await this.ssoConfigRepository.findOne({
      where: { id, enabled: true },
      relations: ['organization'],
    });
    await this.decryptSecret(result?.configs);
    return result;
  }

  async inviteNewUser(
    currentUser: User,
    inviteNewUserDto: InviteNewUserDto,
    manager?: EntityManager
  ): Promise<OrganizationUser> {
    const userParams = <User>{
      firstName: inviteNewUserDto.first_name,
      lastName: inviteNewUserDto.last_name,
      email: inviteNewUserDto.email,
      ...getUserStatusAndSource(lifecycleEvents.USER_INVITE),
    };
    const groups = inviteNewUserDto.groups ?? [];

    return await dbTransactionWrap(async (manager: EntityManager) => {
      let user = await this.usersService.findByEmail(userParams.email, undefined, undefined, manager);

      if (user?.status === USER_STATUS.ARCHIVED) {
        throw new BadRequestException('User is archived in the instance. Contact super admin to activate them.');
      }
      let defaultOrganization: Organization,
        shouldSendWelcomeMail = false;

      if (user?.organizationUsers?.some((ou) => ou.organizationId === currentUser.organizationId)) {
        throw new BadRequestException('Duplicate email found. Please provide a unique email address.');
      }

      if (user?.invitationToken) {
        // user sign up not completed, name will be empty - updating name and source
        await this.usersService.update(
          user.id,
          { firstName: userParams.firstName, lastName: userParams.lastName, source: userParams.source },
          manager
        );
      }

      const isPersonalWorkspaceAllowedConfig = await this.instanceSettingsService.getSettings(
        INSTANCE_USER_SETTINGS.ALLOW_PERSONAL_WORKSPACE
      );
      const isPersonalWorkspaceAllowed = isPersonalWorkspaceAllowedConfig === 'true';
      if (!user) {
        // User not exist
        shouldSendWelcomeMail = true;
        if (isPersonalWorkspaceAllowed) {
          // Create default organization if user not exist
          const { name, slug } = generateNextNameAndSlug('My workspace');
          defaultOrganization = await this.create(name, slug, null, manager);
        }
      } else if (user.invitationToken) {
        // User not setup
        shouldSendWelcomeMail = true;
      }

      user = await this.usersService.create(
        userParams,
        currentUser.organizationId,
        ['all_users', ...groups],
        user,
        true,
        defaultOrganization?.id,
        manager,
        !isPersonalWorkspaceAllowed
      );

      if (defaultOrganization) {
        // Setting up default organization
        await this.organizationUserService.create(user, defaultOrganization, true, manager);
        await this.usersService.attachUserGroup(
          ['all_users', 'admin'],
          defaultOrganization.id,
          user.id,
          false,
          manager
        );
      }

      const currentOrganization: Organization = await this.organizationsRepository.findOneOrFail({
        where: { id: currentUser.organizationId },
      });

      const organizationUser = await this.organizationUserService.create(user, currentOrganization, true, manager);

      await this.usersService.validateLicense(manager);

      await this.auditLoggerService.perform(
        {
          userId: currentUser.id,
          organizationId: currentOrganization.id,
          resourceId: user.id,
          resourceName: user.email,
          resourceType: ResourceTypes.USER,
          actionType: ActionTypes.USER_INVITE,
        },
        manager
      );

      const name = fullName(currentUser.firstName, currentUser.lastName);
      if (shouldSendWelcomeMail) {
        this.emailService
          .sendWelcomeEmail(
            user.email,
            user.firstName,
            user.invitationToken,
            organizationUser.invitationToken,
            organizationUser.organizationId,
            currentOrganization.name,
            name
          )
          .catch((err) => console.error('Error while sending welcome mail', err));
      } else {
        this.emailService
          .sendOrganizationUserWelcomeEmail(
            user.email,
            user.firstName,
            name,
            organizationUser.invitationToken,
            currentOrganization.name,
            organizationUser.organizationId
          )
          .catch((err) => console.error('Error while sending welcome mail', err));
      }
      return organizationUser;
    }, manager);
  }

  decamelizeDefaultGroupNames(groups: string) {
    return groups?.length
      ? groups
          .split('|')
          .map((group: string) =>
            group === 'All Users' || group === 'Admin' ? decamelize(group.replace(' ', '')) : group
          )
      : [];
  }

  async inviteUserswrapper(users, currentUser: User): Promise<void> {
    await dbTransactionWrap(async (manager) => {
      for (let i = 0; i < users.length; i++) {
        await this.inviteNewUser(currentUser, users[i], manager);
      }
    });
  }

  async bulkUploadUsers(currentUser: User, fileStream, res: Response) {
    const users = [];
    const existingUsers = [];
    const archivedUsers = [];
    const invalidRows = [];
    const invalidFields = new Set();
    const invalidGroups = [];
    let isUserInOtherGroupsAndAdmin = false;
    const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;
    const manager = getManager();

    const groupPermissions = await this.groupPermissionService.findAll(currentUser);
    const existingGroups = groupPermissions.map((groupPermission) => groupPermission.group);

    csv
      .parseString(fileStream.toString(), {
        headers: ['first_name', 'last_name', 'email', 'groups'],
        renameHeaders: true,
        ignoreEmpty: true,
      })
      .transform((row: UserCsvRow, next) => {
        return next(null, {
          ...row,
          groups: this.decamelizeDefaultGroupNames(row?.groups),
        });
      })
      .validate(async (data: UserCsvRow, next) => {
        await dbTransactionWrap(async (manager: EntityManager) => {
          //Check for existing users
          const user = await this.usersService.findByEmail(data?.email, undefined, undefined, manager);

          if (user?.status === USER_STATUS.ARCHIVED) {
            archivedUsers.push(data?.email);
          } else if (user?.organizationUsers?.some((ou) => ou.organizationId === currentUser.organizationId)) {
            existingUsers.push(data?.email);
          } else {
            users.push(data);
          }

          //Check for invalid groups
          const receivedGroups: string[] | null = data?.groups.length ? data?.groups : null;

          if (Array.isArray(receivedGroups)) {
            for (const group of receivedGroups) {
              if (group === 'admin' && receivedGroups.includes('all_users') && receivedGroups.length > 2) {
                isUserInOtherGroupsAndAdmin = true;
                break;
              }

              if (existingGroups.indexOf(group) === -1) {
                invalidGroups.push(group);
              }
            }
          }

          data.first_name = data.first_name?.trim();
          data.last_name = data.last_name?.trim();

          const isValidName = data.first_name !== '' || data.last_name !== '';

          return next(null, isValidName && emailPattern.test(data.email) && receivedGroups?.length > 0);
        }, manager);
      })
      .on('data', function () {})
      .on('data-invalid', (row, rowNumber) => {
        const invalidField = Object.keys(row).filter((key) => {
          if (Array.isArray(row[key])) {
            return row[key].length === 0;
          }
          return !row[key] || row[key] === '';
        });
        invalidRows.push(rowNumber);
        invalidFields.add(invalidField);
      })
      .on('end', async (rowCount: number) => {
        try {
          if (rowCount > MAX_ROW_COUNT) {
            throw new BadRequestException('Row count cannot be greater than 500');
          }

          if (invalidRows.length) {
            const invalidFieldsArray = invalidFields.entries().next().value[1];
            const errorMsg = `Invalid row(s): [${invalidFieldsArray.join(', ')}] in [${
              invalidRows.length
            }] row(s). No users were uploaded.`;
            throw new BadRequestException(errorMsg);
          }

          if (isUserInOtherGroupsAndAdmin) {
            throw new BadRequestException(
              'Conflicting Group Memberships: User cannot be in both the Admin group and other groups simultaneously.'
            );
          }

          if (invalidGroups.length) {
            throw new BadRequestException(
              `${invalidGroups.length} group${isPlural(invalidGroups)} doesn't exist. No users were uploaded`
            );
          }

          if (archivedUsers.length) {
            throw new BadRequestException(
              `User${isPlural(archivedUsers)} with email ${archivedUsers.join(
                ', '
              )} is archived. No users were uploaded`
            );
          }

          if (existingUsers.length) {
            throw new BadRequestException(
              `${existingUsers.length} users with same email already exist. No users were uploaded `
            );
          }

          if (users.length === 0) {
            throw new BadRequestException('No users were uploaded');
          }

          if (users.length > 250) {
            throw new BadRequestException(`You can only invite 250 users at a time`);
          }

          await this.inviteUserswrapper(users, currentUser);
          res.status(201).send({ message: `${rowCount} user${isPlural(users)} are being added` });
        } catch (error) {
          const { status, response } = error;
          if (status === 451) {
            res.status(status).send({ message: response, statusCode: status });
            return;
          }
          res.status(status).send(JSON.stringify(response));
        }
      })
      .on('error', (error) => {
        throw error.message;
      });
  }

  async organizationsLimit() {
    const licenseTerms = await this.licenseService.getLicenseTerms([LICENSE_FIELD.WORKSPACES, LICENSE_FIELD.STATUS]);

    return {
      workspacesCount: generatePayloadForLimits(
        licenseTerms[LICENSE_FIELD.WORKSPACES] !== LICENSE_LIMIT.UNLIMITED
          ? await this.organizationUserService.organizationsCount()
          : 0,
        licenseTerms[LICENSE_FIELD.WORKSPACES],
        licenseTerms[LICENSE_FIELD.STATUS],
        LICENSE_LIMITS_LABEL.WORKSPACES
      ),
    };
  }

  async checkWorkspaceUniqueness(name: string, slug: string) {
    if (!(slug || name)) {
      throw new NotAcceptableException('Request should contain the slug or name');
    }
    const result = await getManager().findOne(Organization, {
      ...(name && { name }),
      ...(slug && { slug }),
    });
    if (result) throw new ConflictException(`${name ? 'Name' : 'Slug'} must be unique`);
    return;
  }

  async createSampleDB(organizationId, manager: EntityManager) {
    const config = {
      name: 'Sample data source',
      kind: 'postgresql',
      type: DataSourceTypes.SAMPLE,
      scope: DataSourceScopes.GLOBAL,
      organizationId,
    };
    const options = [
      {
        key: 'host',
        value: this.configService.get<string>('PG_HOST'),
        encrypted: true,
      },
      {
        key: 'port',
        value: this.configService.get<string>('PG_PORT'),
        encrypted: true,
      },
      {
        key: 'database',
        value: 'sample_db',
      },
      {
        key: 'username',
        value: this.configService.get<string>('PG_USER'),
        encrypted: true,
      },
      {
        key: 'password',
        value: this.configService.get<string>('PG_PASS'),
        encrypted: true,
      },
      {
        key: 'ssl_enabled',
        value: false,
        encrypted: true,
      },
      { key: 'ssl_certificate', value: 'none', encrypted: false },
    ];
    const dataSource = manager.create(DataSource, config);
    await manager.save(dataSource);

    const allEnvs: AppEnvironment[] = await this.appEnvironmentService.getAll(organizationId, manager);

    await Promise.all(
      allEnvs?.map(async (env) => {
        const parsedOptions = await this.dataSourceService.parseOptionsForCreate(options);
        await manager.save(
          manager.create(DataSourceOptions, {
            environmentId: env.id,
            dataSourceId: dataSource.id,
            options: parsedOptions,
          })
        );
      })
    );
  }
}
