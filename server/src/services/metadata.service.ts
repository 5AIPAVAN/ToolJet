import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, getManager, Repository } from 'typeorm';
import { Metadata } from 'src/entities/metadata.entity';
import { gt } from 'semver';
import got from 'got';
import { User } from 'src/entities/user.entity';
import { ConfigService } from '@nestjs/config';
import { InternalTable } from 'src/entities/internal_table.entity';
import { App } from 'src/entities/app.entity';
import { DataSource } from 'src/entities/data_source.entity';
import { LicenseCountsService } from './license_counts.service';
import { LicenseService } from './license.service';
import { LICENSE_FIELD } from 'src/helpers/license.helper';
import License from '@ee/licensing/configs/License';
import { TelemetryDataDto } from '@dto/user.dto';
import { OrganizationLicenseService } from './organization_license.service';

@Injectable()
export class MetadataService {
  constructor(
    @InjectRepository(Metadata)
    private metadataRepository: Repository<Metadata>,
    private configService: ConfigService,
    private organizationLicenseService: OrganizationLicenseService,
    private licenseService: LicenseService,
    private licenseCountsService: LicenseCountsService
  ) {}

  async getMetaData() {
    let metadata = await this.metadataRepository.findOne({});

    if (!metadata) {
      metadata = await this.metadataRepository.save(
        this.metadataRepository.create({
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
    }

    return metadata;
  }

  async updateMetaData(newOptions: any) {
    const metadata = await this.metadataRepository.findOne({});

    return await this.metadataRepository.update(metadata.id, {
      data: { ...metadata.data, ...newOptions },
    });
  }

  async finishOnboarding(telemetryData: TelemetryDataDto) {
    if (process.env.NODE_ENV == 'production') {
      const metadata = await this.getMetaData();
      void this.finishInstallation(telemetryData, metadata);

      await this.updateMetaData({
        onboarded: true,
      });
    }
  }

  private async finishInstallation(telemetryData: TelemetryDataDto, metadata: Metadata) {
    const { companyName, companySize, name, role, email, phoneNumber, requestedTrial } = telemetryData;

    try {
      return await got('https://hub.tooljet.io/subscribe', {
        method: 'post',
        json: {
          id: metadata.id,
          installed_version: globalThis.TOOLJET_VERSION,
          name,
          email,
          org: companyName,
          company_size: companySize,
          phone_number: phoneNumber,
          role,
          trial_opted: !!requestedTrial,
          trial_expiry: requestedTrial && (await this.licenseService.getLicenseTerms(LICENSE_FIELD.STATUS))?.expiryDate,
        },
      });
    } catch (error) {
      console.error('Error while connecting to URL https://hub.tooljet.io/subscribe', error);
    }
  }

  async sendTelemetryData(metadata: Metadata) {
    const manager = getManager();
    const totalUserCount = await manager.count(User);
    const { editor: totalEditorCount, viewer: totalViewerCount } =
      await this.organizationLicenseService.fetchTotalViewerEditorCount(manager);
    const totalAppCount = await manager.count(App);
    const totalInternalTableCount = await manager.count(InternalTable);
    const totalDatasourcesByKindCount = await this.fetchDatasourcesByKindCount(manager);

    try {
      return await got('https://hub.tooljet.io/telemetry', {
        method: 'post',
        json: {
          id: metadata.id,
          total_users: totalUserCount,
          total_editors: totalEditorCount,
          total_viewers: totalViewerCount,
          total_apps: totalAppCount,
          tooljet_db_table_count: totalInternalTableCount,
          tooljet_version: globalThis.TOOLJET_VERSION,
          data_sources_count: totalDatasourcesByKindCount,
          deployment_platform: this.configService.get<string>('DEPLOYMENT_PLATFORM'),
          license_info: License.Instance()?.terms,
        },
      });
    } catch (error) {
      console.error('Error while connecting to URL https://hub.tooljet.io/telemetry', error);
    }
  }

  async checkForUpdates(metadata: Metadata) {
    const installedVersion = globalThis.TOOLJET_VERSION;
    let latestVersion;

    try {
      const response = await got('https://hub.tooljet.io/updates', {
        method: 'post',
      });
      const data = JSON.parse(response.body);
      latestVersion = data['latest_version'];

      const newOptions = {
        last_checked: new Date(),
      };

      if (gt(latestVersion, installedVersion) && installedVersion !== metadata.data['ignored_version']) {
        newOptions['latest_version'] = latestVersion;
        newOptions['version_ignored'] = false;
      }

      await this.updateMetaData(newOptions);
    } catch (error) {
      console.error('Error while connecting to URL https://hub.tooljet.io/updates', error);
    }
    return { latestVersion: latestVersion || installedVersion };
  }
  async fetchDatasourcesByKindCount(manager: EntityManager) {
    const dsGroupedByKind = await manager
      .createQueryBuilder(DataSource, 'data_sources')
      .select('kind')
      .addSelect('COUNT(*)', 'count')
      .groupBy('kind')
      .getRawMany();

    return dsGroupedByKind.reduce((acc, { kind, count }) => {
      acc[kind] = count;
      return acc;
    }, {});
  }
}
