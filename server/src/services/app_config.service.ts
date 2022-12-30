import { Injectable } from '@nestjs/common';
import { InstanceSettingsService } from './instance_settings.service';

@Injectable()
export class AppConfigService {
  constructor(private instanceSettingsService: InstanceSettingsService) {}
  async public_config() {
    const whitelistedConfigVars = process.env.ALLOWED_CLIENT_CONFIG_VARS
      ? this.fetchAllowedConfigFromEnv()
      : this.fetchDefaultConfig();

    const mapEntries = await Promise.all(
      whitelistedConfigVars.map((envVar) => [envVar, process.env[envVar]] as [string, string])
    );

    const instanceConfigs = await this.instanceSettingsService.getSettings(this.fetchDefaultInstanceConfig());
    return { ...instanceConfigs, ...Object.fromEntries(mapEntries) };
  }

  fetchDefaultConfig() {
    return [
      'TOOLJET_SERVER_URL',
      'RELEASE_VERSION',
      'GOOGLE_MAPS_API_KEY',
      'APM_VENDOR',
      'SENTRY_DNS',
      'SENTRY_DEBUG',
      'TOOLJET_HOST',
      'SUB_PATH',
      'DISABLE_MULTI_WORKSPACE',
      'ENABLE_MARKETPLACE_FEATURE',
      'WHITE_LABEL_LOGO',
      'WHITE_LABEL_TEXT',
      'WHITE_LABEL_FAVICON',
      'ENABLE_TOOLJET_DB',
    ];
  }

  fetchDefaultInstanceConfig() {
    return ['ALLOW_PERSONAL_WORKSPACE'];
  }

  fetchAllowedConfigFromEnv() {
    const whitelistedConfigVars = process.env.ALLOWED_CLIENT_CONFIG_VARS.split(',').map((envVar) => envVar.trim());

    return whitelistedConfigVars;
  }
}
