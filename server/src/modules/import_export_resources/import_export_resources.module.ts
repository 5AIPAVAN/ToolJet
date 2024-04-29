import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportExportResourcesController } from '@controllers/import_export_resources.controller';
import { TooljetDbService } from '@services/tooljet_db.service';
import { ImportExportResourcesService } from '@services/import_export_resources.service';
import { AppImportExportService } from '@services/app_import_export.service';
import { TooljetDbImportExportService } from '@services/tooljet_db_import_export_service';
import { DataSourcesService } from '@services/data_sources.service';
import { AppEnvironmentService } from '@services/app_environments.service';
import { Plugin } from 'src/entities/plugin.entity';
import { PluginsHelper } from 'src/helpers/plugins.helper';
import { CredentialsService } from '@services/credentials.service';
import { DataSource } from 'src/entities/data_source.entity';
import { tooljetDbOrmconfig } from '../../../ormconfig';
import { PluginsModule } from '../plugins/plugins.module';
import { EncryptionService } from '@services/encryption.service';
import { Credential } from '../../../src/entities/credential.entity';
import { CaslModule } from '../casl/casl.module';
import { AppsService } from '@services/apps.service';
import { App } from 'src/entities/app.entity';
import { AppVersion } from 'src/entities/app_version.entity';
import { AppUser } from 'src/entities/app_user.entity';
import { UsersService } from '@services/users.service';
import { FilesService } from '@services/files.service';
import { User } from 'src/entities/user.entity';
import { Organization } from 'src/entities/organization.entity';
import { File } from 'src/entities/file.entity';
import { AuditLoggerService } from '@services/audit_logger.service';
import { TooljetDbOperationsService } from '@services/tooljet_db_operations.service';
import { PostgrestProxyService } from '@services/postgrest_proxy.service';
import { TooljetDbModule } from '../tooljet_db/tooljet_db.module';

const imports = [
  PluginsModule,
  CaslModule,
  TypeOrmModule.forFeature([User, Organization, File, AppUser, AppVersion, App, Credential, Plugin, DataSource]),
  TooljetDbModule,
];

if (process.env.ENABLE_TOOLJET_DB === 'true') {
  imports.unshift(TypeOrmModule.forRoot(tooljetDbOrmconfig));
}

@Module({
  imports,
  controllers: [ImportExportResourcesController],
  providers: [
    EncryptionService,
    ImportExportResourcesService,
    AppImportExportService,
    TooljetDbImportExportService,
    DataSourcesService,
    AppEnvironmentService,
    TooljetDbService,
    PluginsHelper,
    AppsService,
    CredentialsService,
    UsersService,
    FilesService,
    AuditLoggerService,
    TooljetDbOperationsService,
    PostgrestProxyService,
  ],
  exports: [ImportExportResourcesService],
})
export class ImportExportResourcesModule {}
