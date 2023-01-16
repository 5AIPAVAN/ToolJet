import { Injectable, NotAcceptableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '@services/auth.service';
import { OrganizationsService } from '@services/organizations.service';
import { OrganizationUsersService } from '@services/organization_users.service';
import { UsersService } from '@services/users.service';
import { OidcOAuthService } from './oidc_auth.service';
import { decamelizeKeys } from 'humps';
import { Organization } from 'src/entities/organization.entity';
import { OrganizationUser } from 'src/entities/organization_user.entity';
import { SSOConfigs } from 'src/entities/sso_config.entity';
import { User } from 'src/entities/user.entity';
import {
  getUserErrorMessages,
  getUserStatusAndSource,
  USER_STATUS,
  lifecycleEvents,
  URL_SSO_SOURCE,
  WORKSPACE_USER_STATUS,
} from 'src/helpers/user_lifecycle';
import { dbTransactionWrap, isSuperAdmin } from 'src/helpers/utils.helper';
import { DeepPartial, EntityManager } from 'typeorm';
import { GitOAuthService } from './git_oauth.service';
import { GoogleOAuthService } from './google_oauth.service';
import UserResponse from './models/user_response';
import License from '@ee/licensing/configs/License';
import { InstanceSettingsService } from '@services/instance_settings.service';

@Injectable()
export class OauthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly organizationService: OrganizationsService,
    private readonly organizationUsersService: OrganizationUsersService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly gitOAuthService: GitOAuthService,
    private readonly oidcOAuthService: OidcOAuthService,
    private readonly instanceSettingsService: InstanceSettingsService,
    private configService: ConfigService
  ) {}

  #isValidDomain(email: string, restrictedDomain: string): boolean {
    if (!email) {
      return false;
    }
    const domain = email.substring(email.lastIndexOf('@') + 1);

    if (!restrictedDomain) {
      return true;
    }
    if (!domain) {
      return false;
    }
    if (
      !restrictedDomain
        .split(',')
        .map((e) => e && e.trim())
        .filter((e) => !!e)
        .includes(domain)
    ) {
      return false;
    }
    return true;
  }

  async #findOrCreateUser(
    { firstName, lastName, email, sso }: UserResponse,
    organization: DeepPartial<Organization>,
    manager?: EntityManager
  ): Promise<User> {
    // User not exist in the workspace, creating
    let user: User;
    let defaultOrganization: Organization;
    user = await this.usersService.findByEmail(email);

    const allowPersonalWorkspace =
      (await this.instanceSettingsService.getSettings('ALLOW_PERSONAL_WORKSPACE')) === 'true';

    const organizationUser: OrganizationUser = user?.organizationUsers?.find(
      (ou) => ou.organizationId === organization.id
    );

    if (organizationUser?.status === WORKSPACE_USER_STATUS.ARCHIVED) {
      throw new UnauthorizedException('User does not exist in the workspace');
    }
    if (!user && this.configService.get<string>('DISABLE_MULTI_WORKSPACE') !== 'true' && allowPersonalWorkspace) {
      defaultOrganization = await this.organizationService.create('Untitled workspace', null, manager);
    }

    const groups = ['all_users'];
    user = await this.usersService.create(
      { firstName, lastName, email, ...getUserStatusAndSource(lifecycleEvents.USER_SSO_VERIFY, sso) },
      organization.id,
      groups,
      user,
      true,
      defaultOrganization?.id,
      manager
    );
    // Setting up invited organization, organization user status should be invited if user status is invited
    await this.organizationUsersService.create(user, organization, !!user.invitationToken, manager);

    if (defaultOrganization) {
      // Setting up default organization
      await this.organizationUsersService.create(user, defaultOrganization, true, manager);
      await this.usersService.attachUserGroup(['all_users', 'admin'], defaultOrganization.id, user.id, manager);
    }
    return user;
  }

  #getSSOConfigs(ssoType: 'google' | 'git' | 'openid'): Partial<SSOConfigs> {
    switch (ssoType) {
      case 'google':
        return {
          enabled: !!this.configService.get<string>('SSO_GOOGLE_OAUTH2_CLIENT_ID'),
          configs: { clientId: this.configService.get<string>('SSO_GOOGLE_OAUTH2_CLIENT_ID') },
        };
      case 'git':
        return {
          enabled: !!this.configService.get<string>('SSO_GIT_OAUTH2_CLIENT_ID'),
          configs: {
            clientId: this.configService.get<string>('SSO_GIT_OAUTH2_CLIENT_ID'),
            clientSecret: this.configService.get<string>('SSO_GIT_OAUTH2_CLIENT_SECRET'),
            hostName: this.configService.get<string>('SSO_GIT_OAUTH2_HOST'),
          },
        };
      case 'openid':
        return {
          enabled: !!this.configService.get<string>('SSO_OPENID_CLIENT_ID'),
          configs: {
            clientId: this.configService.get<string>('SSO_OPENID_CLIENT_ID'),
            clientSecret: this.configService.get<string>('SSO_OPENID_CLIENT_SECRET'),
            wellKnownUrl: this.configService.get<string>('SSO_OPENID_WELL_KNOWN_URL'),
          },
        };
      default:
        return;
    }
  }

  #getInstanceSSOConfigs(ssoType: 'google' | 'git' | 'openid'): DeepPartial<SSOConfigs> {
    return {
      organization: {
        enableSignUp: this.configService.get<string>('SSO_DISABLE_SIGNUPS') !== 'true',
        domain: this.configService.get<string>('SSO_ACCEPTED_DOMAINS'),
      },
      sso: ssoType,
      ...this.#getSSOConfigs(ssoType),
    };
  }

  async signIn(
    ssoResponse: SSOResponse,
    configId?: string,
    ssoType?: 'google' | 'git' | 'openid',
    cookies?: object
  ): Promise<any> {
    const { organizationId } = ssoResponse;
    let ssoConfigs: DeepPartial<SSOConfigs>;
    let organization: DeepPartial<Organization>;
    const isSingleOrganization: boolean = this.configService.get<string>('DISABLE_MULTI_WORKSPACE') === 'true';
    const isInstanceSSOLogin = !!(!configId && ssoType && !organizationId);

    if (configId) {
      // SSO under an organization
      ssoConfigs = await this.organizationService.getConfigs(configId);
      organization = ssoConfigs?.organization;
    } else if (!isSingleOrganization && ssoType && organizationId) {
      // Instance SSO login from organization login page
      organization = await this.organizationService.fetchOrganizationDetails(organizationId, [true], false, true);
      ssoConfigs = organization?.ssoConfigs?.find((conf) => conf.sso === ssoType);
    } else if (!isSingleOrganization && isInstanceSSOLogin) {
      // Instance SSO login from common login page
      ssoConfigs = this.#getInstanceSSOConfigs(ssoType);
      organization = ssoConfigs?.organization;
    } else {
      throw new UnauthorizedException();
    }

    if (!organization || !ssoConfigs) {
      // Should obtain organization configs
      throw new UnauthorizedException();
    }
    const { enableSignUp, domain } = organization;
    const { sso, configs } = ssoConfigs;
    const { token } = ssoResponse;

    let userResponse: UserResponse;
    switch (sso) {
      case 'google':
        userResponse = await this.googleOAuthService.signIn(token, configs);
        break;

      case 'git':
        userResponse = await this.gitOAuthService.signIn(token, configs);
        break;

      case 'openid':
        if (!License.Instance.oidc) {
          throw new UnauthorizedException('OIDC login disabled');
        }
        userResponse = await this.oidcOAuthService.signIn(token, {
          ...configs,
          configId,
          codeVerifier: cookies['oidc_code_verifier'],
        });
        break;

      default:
        break;
    }

    if (!(userResponse.userSSOId && userResponse.email)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let userDetails: User = await this.usersService.findByEmail(userResponse.email);

    if (userDetails?.status === 'archived') {
      throw new NotAcceptableException('User has been archived, please contact the administrator');
    }

    if (!isSuperAdmin(userDetails) && !this.#isValidDomain(userResponse.email, domain)) {
      throw new UnauthorizedException(`You cannot sign in using the mail id - Domain verification failed`);
    }

    if (!userResponse.firstName) {
      // If firstName not found
      userResponse.firstName = userResponse.email?.split('@')?.[0];
    }

    return await dbTransactionWrap(async (manager: EntityManager) => {
      let organizationDetails: DeepPartial<Organization>;
      const allowPersonalWorkspace =
        isSuperAdmin(userDetails) ||
        (await this.instanceSettingsService.getSettings('ALLOW_PERSONAL_WORKSPACE')) === 'true';

      if (!isSingleOrganization && isInstanceSSOLogin && !organizationId) {
        // Login from main login page - Multi-Workspace enabled

        if (userDetails?.status === USER_STATUS.ARCHIVED) {
          throw new UnauthorizedException(getUserErrorMessages(userDetails.status));
        }

        if (!userDetails && enableSignUp && allowPersonalWorkspace) {
          // Create new user
          let defaultOrganization: DeepPartial<Organization> = organization;

          // Not logging in to specific organization, creating new
          defaultOrganization = await this.organizationService.create('Untitled workspace', null, manager);

          const groups = ['all_users', 'admin'];
          userDetails = await this.usersService.create(
            {
              firstName: userResponse.firstName,
              lastName: userResponse.lastName,
              email: userResponse.email,
              ...getUserStatusAndSource(lifecycleEvents.USER_SSO_VERIFY, sso),
            },
            defaultOrganization.id,
            groups,
            null,
            true,
            null,
            manager
          );

          void this.usersService.createCRMUser(userDetails);
          await this.organizationUsersService.create(userDetails, defaultOrganization, true, manager);
          organizationDetails = defaultOrganization;
        } else if (userDetails) {
          // Finding organization to be loaded
          const organizationList: Organization[] = await this.organizationService.findOrganizationWithLoginSupport(
            userDetails,
            'sso',
            userDetails.invitationToken
              ? [WORKSPACE_USER_STATUS.ACTIVE, WORKSPACE_USER_STATUS.INVITED]
              : WORKSPACE_USER_STATUS.ACTIVE
          );

          const defaultOrgDetails: Organization = organizationList?.find(
            (og) => og.id === userDetails.defaultOrganizationId
          );
          if (defaultOrgDetails) {
            // default organization SSO login enabled
            organizationDetails = defaultOrgDetails;
          } else if (organizationList?.length > 0) {
            // default organization SSO login not enabled, picking first one from SSO enabled list
            organizationDetails = organizationList[0];
          } else if (allowPersonalWorkspace) {
            // no SSO login enabled organization available for user - creating new one
            organizationDetails = await this.organizationService.create('Untitled workspace', userDetails, manager);
          } else {
            throw new UnauthorizedException(
              'User not included in any workspace or workspace does not supports SSO login'
            );
          }
        } else if (!userDetails) {
          throw new UnauthorizedException('User does not exist, please sign up');
        }
      } else {
        // single workspace or workspace login
        userDetails = await this.usersService.findByEmail(userResponse.email, organization.id, [
          WORKSPACE_USER_STATUS.ACTIVE,
          WORKSPACE_USER_STATUS.INVITED,
        ]);

        if (userDetails?.status === USER_STATUS.ARCHIVED) {
          throw new UnauthorizedException(getUserErrorMessages(userDetails.status));
        }
        if (userDetails) {
          // user already exist
          if (
            !userDetails.invitationToken &&
            userDetails.organizationUsers[0].status === WORKSPACE_USER_STATUS.INVITED
          ) {
            // user exists. onboarding completed, but invited status in the organization
            // Activating invited workspace
            await this.organizationUsersService.activateOrganization(userDetails.organizationUsers[0], manager);
          }
        } else if (!userDetails && enableSignUp) {
          userDetails = await this.#findOrCreateUser(userResponse, organization, manager);
        } else if (!userDetails) {
          throw new UnauthorizedException('User does not exist in the workspace');
        }
        organizationDetails = organization;

        userDetails = await this.usersService.findByEmail(
          userResponse.email,
          organization.id,
          [WORKSPACE_USER_STATUS.ACTIVE, WORKSPACE_USER_STATUS.INVITED],
          manager
        );

        if (userDetails.invitationToken) {
          // User account setup not done, updating source and status
          await this.usersService.updateUser(
            userDetails.id,
            getUserStatusAndSource(lifecycleEvents.USER_SSO_VERIFY, sso),
            manager
          );
          // New user created and invited to the organization
          const organizationToken = userDetails.organizationUsers?.find(
            (ou) => ou.organizationId === organization.id
          )?.invitationToken;

          if (this.configService.get<string>('DISABLE_MULTI_WORKSPACE') !== 'true') {
            return await this.validateLicense(
              decamelizeKeys({
                redirectUrl: `${this.configService.get<string>('TOOLJET_HOST')}/invitations/${
                  userDetails.invitationToken
                }/workspaces/${organizationToken}?oid=${organization.id}&source=${URL_SSO_SOURCE}`,
              }),
              manager
            );
          } else {
            return await this.validateLicense(
              decamelizeKeys({
                redirectUrl: `${this.configService.get<string>(
                  'TOOLJET_HOST'
                )}/organization-invitations/${organizationToken}?oid=${organization.id}&source=${URL_SSO_SOURCE}`,
              }),
              manager
            );
          }
        }
      }

      if (userDetails.invitationToken) {
        // User account setup not done, updating source and status
        await this.usersService.updateUser(
          userDetails.id,
          getUserStatusAndSource(lifecycleEvents.USER_SSO_VERIFY, sso),
          manager
        );
        return await this.validateLicense(
          decamelizeKeys({
            redirectUrl: `${this.configService.get<string>('TOOLJET_HOST')}/invitations/${
              userDetails.invitationToken
            }?source=${URL_SSO_SOURCE}`,
          }),
          manager
        );
      }

      return await this.validateLicense(
        await this.authService.generateLoginResultPayload(
          userDetails,
          organizationDetails,
          isInstanceSSOLogin,
          false,
          manager
        ),
        manager
      );
    });
  }
  private async validateLicense(response: any, manager: EntityManager) {
    await this.usersService.validateLicense(manager);
    return response;
  }
}

interface SSOResponse {
  token: string;
  state?: string;
  codeVerifier?: string;
  organizationId?: string;
}
