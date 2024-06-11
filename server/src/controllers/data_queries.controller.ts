import {
  Controller,
  Get,
  Param,
  Body,
  Post,
  Patch,
  Delete,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  Put,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../src/modules/auth/jwt-auth.guard';
import { decamelizeKeys } from 'humps';
import { DataQueriesService } from '../../src/services/data_queries.service';
import { DataSourcesService } from '../../src/services/data_sources.service';
import { QueryAuthGuard } from 'src/modules/auth/query-auth.guard';
import { AppsAbilityFactory } from 'src/modules/casl/abilities/apps-ability.factory';
import { AppsService } from '@services/apps.service';
import { CreateDataQueryDto, UpdateDataQueryDto, UpdatingReferencesOptionsDto } from '@dto/data-query.dto';
import { User } from 'src/decorators/user.decorator';
import { decode } from 'js-base64';
import { dbTransactionWrap } from 'src/helpers/utils.helper';
import { EntityManager } from 'typeorm';
import { DataSource } from 'src/entities/data_source.entity';
import { DataSourceScopes, DataSourceTypes } from 'src/helpers/data_source.constants';
import { App } from 'src/entities/app.entity';
import { GlobalDataSourceAbilityFactory } from 'src/modules/casl/abilities/global-datasource-ability.factory';
import { isEmpty } from 'class-validator';
import { AppEnvironment } from 'src/entities/app_environments.entity';
import { AppVersion } from 'src/entities/app_version.entity';
import { Response } from 'express';

@Controller('data_queries')
export class DataQueriesController {
  constructor(
    private appsService: AppsService,
    private dataQueriesService: DataQueriesService,
    private dataSourcesService: DataSourcesService,
    private appsAbilityFactory: AppsAbilityFactory,
    private globalDataSourcesAbilityFactory: GlobalDataSourceAbilityFactory
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async index(@User() user, @Query() query) {
    const app = await this.appsService.findAppFromVersion(query.app_version_id);
    const ability = await this.appsAbilityFactory.appsActions(user, app.id);

    if (!ability.can('getQueries', app)) {
      throw new ForbiddenException('you do not have permissions to perform this action');
    }

    const queries = await this.dataQueriesService.all(query);
    const seralizedQueries = [];

    // serialize
    for (const query of queries) {
      if (query.dataSource.type === DataSourceTypes.STATIC) {
        delete query['dataSourceId'];
      }
      delete query['dataSource'];

      const decamelizedQuery = decamelizeKeys(query);

      decamelizedQuery['options'] = query.options;

      if (query.plugin) {
        decamelizedQuery['plugin'].manifest_file.data = JSON.parse(
          decode(query.plugin.manifestFile.data.toString('utf8'))
        );
        decamelizedQuery['plugin'].icon_file.data = query.plugin.iconFile.data.toString('utf8');
      }

      seralizedQueries.push(decamelizedQuery);
    }

    const response = { data_queries: seralizedQueries };

    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@User() user, @Body() dataQueryDto: CreateDataQueryDto): Promise<object> {
    const {
      kind,
      name,
      options,
      data_source_id: dataSourceId,
      plugin_id: pluginId,
      app_version_id: appVersionId,
    } = dataQueryDto;

    let dataSource: DataSource;
    let app: App;

    /* Check for promoted versions */
    if (appVersionId) {
      await this.validateQueryActionsAgainstEnvironment(
        user.defaultOrganizationId,
        appVersionId,
        'You cannot create queries in the promoted version.'
      );
    }

    if (
      !dataSourceId &&
      !(kind === 'restapi' || kind === 'runjs' || kind === 'tooljetdb' || kind === 'runpy' || kind === 'workflows')
    ) {
      throw new BadRequestException();
    }

    return dbTransactionWrap(async (manager: EntityManager) => {
      if (
        !dataSourceId &&
        (kind === 'restapi' || kind === 'runjs' || kind === 'tooljetdb' || kind === 'runpy' || kind === 'workflows')
      ) {
        dataSource = await this.dataSourcesService.findDefaultDataSource(
          kind,
          appVersionId,
          pluginId,
          user.organizationId,
          manager
        );
      }
      dataSource = await this.dataSourcesService.findOne(dataSource?.id || dataSourceId, manager);

      if (dataSource.scope === DataSourceScopes.GLOBAL) {
        app = await this.appsService.findAppFromVersion(appVersionId);
        const globalDataSourceAbility = await this.globalDataSourcesAbilityFactory.globalDataSourceActions(
          user,
          dataSource.id
        );
        if (
          !(
            globalDataSourceAbility.can('createGlobalDataSource', dataSource) ||
            globalDataSourceAbility.can('readGlobalDataSource', dataSource) ||
            globalDataSourceAbility.can('deleteGlobalDataSource', dataSource)
          )
        ) {
          throw new ForbiddenException('You do not have permissions to perform this action');
        }
      } else {
        app = await this.dataSourcesService.findApp(dataSource?.id || dataSourceId, manager);
      }

      const ability = await this.appsAbilityFactory.appsActions(user, app.id);

      if (!ability.can('createQuery', app)) {
        throw new ForbiddenException('you do not have permissions to perform this action');
      }

      // todo: pass the whole dto instead of indv. values
      const dataQuery = await this.dataQueriesService.create(
        name,
        options,
        dataSource?.id || dataSourceId,
        appVersionId,
        manager
      );

      const decamelizedQuery = decamelizeKeys({ ...dataQuery, kind });

      decamelizedQuery['options'] = dataQuery.options;

      return decamelizedQuery;
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@User() user, @Param('id') dataQueryId, @Body() updateDataQueryDto: UpdateDataQueryDto) {
    const { name, options, data_source_id } = updateDataQueryDto;

    const dataQuery = await this.dataQueriesService.findOne(dataQueryId);
    const ability = await this.appsAbilityFactory.appsActions(user, dataQuery.app.id);
    const globalDataSourceAbility = await this.globalDataSourcesAbilityFactory.globalDataSourceActions(
      user,
      dataQuery.dataSourceId
    );

    if (!ability.can('updateQuery', dataQuery.app)) {
      throw new ForbiddenException('you do not have permissions to perform this action');
    }

    if (
      dataQuery.dataSource.scope === DataSourceScopes.GLOBAL &&
      !(
        globalDataSourceAbility.can('createGlobalDataSource', dataQuery.dataSource) ||
        globalDataSourceAbility.can('updateGlobalDataSource', dataQuery.dataSource) ||
        globalDataSourceAbility.can('readGlobalDataSource', dataQuery.dataSource) ||
        globalDataSourceAbility.can('deleteGlobalDataSource', dataQuery.dataSource)
      )
    ) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const appVersionId = dataQuery.appVersionId;
    if (appVersionId) {
      await this.validateQueryActionsAgainstEnvironment(
        user.defaultOrganizationId,
        appVersionId,
        'You cannot update queries in the promoted version.'
      );
    }

    const result = await this.dataQueriesService.update(dataQueryId, name, options, data_source_id);
    const decamelizedQuery = decamelizeKeys({ ...dataQuery, ...result });
    decamelizedQuery['options'] = result.options;
    return decamelizedQuery;
  }

  //* On Updating references, need update the options of multiple queries
  @UseGuards(JwtAuthGuard)
  @Patch()
  async bulkUpdate(@User() user, @Body() updatingReferencesOptions: UpdatingReferencesOptionsDto) {
    const appVersionId = updatingReferencesOptions.app_version_id;
    const app = await this.appsService.findAppFromVersion(appVersionId);
    const ability = await this.appsAbilityFactory.appsActions(user, app.id);

    if (!ability.can('getQueries', app)) {
      throw new ForbiddenException('you do not have permissions to perform this action');
    }

    return await this.dataQueriesService.bulkUpdateQueryOptions(updatingReferencesOptions.data_queries_options);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@User() user, @Param('id') dataQueryId) {
    const dataQuery = await this.dataQueriesService.findOne(dataQueryId);
    const ability = await this.appsAbilityFactory.appsActions(user, dataQuery.app.id);
    const globalDataSourceAbility = await this.globalDataSourcesAbilityFactory.globalDataSourceActions(
      user,
      dataQuery.dataSourceId
    );

    if (!ability.can('deleteQuery', dataQuery.app)) {
      throw new ForbiddenException('you do not have permissions to perform this action');
    }

    if (
      dataQuery.dataSource.scope === DataSourceScopes.GLOBAL &&
      !(
        globalDataSourceAbility.can('createGlobalDataSource', dataQuery.dataSource) ||
        globalDataSourceAbility.can('readGlobalDataSource', dataQuery.dataSource) ||
        globalDataSourceAbility.can('deleteGlobalDataSource', dataQuery.dataSource) ||
        globalDataSourceAbility.can('updateGlobalDataSource', dataQuery.dataSource)
      )
    ) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const result = await this.dataQueriesService.delete(dataQueryId);
    return decamelizeKeys(result);
  }

  @UseGuards(QueryAuthGuard)
  @Post([':id/run/:environmentId', ':id/run'])
  async runQuery(
    @User() user,
    @Param('id') dataQueryId,
    @Param('environmentId') environmentId,
    @Body() updateDataQueryDto: UpdateDataQueryDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const { options, resolvedOptions, data_source_id } = updateDataQueryDto;

    const dataQuery = await this.dataQueriesService.findOne(dataQueryId);

    if (user) {
      const ability = await this.appsAbilityFactory.appsActions(user, dataQuery.app.id);

      if (!ability.can('runQuery', dataQuery.app)) {
        throw new ForbiddenException('you do not have permissions to perform this action');
      }

      if (ability.can('updateQuery', dataQuery.app) && !isEmpty(options)) {
        await this.dataQueriesService.update(dataQueryId, dataQuery.name, options, data_source_id);
        dataQuery['options'] = options;
      }
    }

    let result = {};

    try {
      result = await this.dataQueriesService.runQuery(user, dataQuery, resolvedOptions, response, environmentId);
    } catch (error) {
      if (error.constructor.name === 'QueryError') {
        result = {
          status: 'failed',
          message: error.message,
          description: error.description,
          data: error.data,
        };
      } else {
        console.log(error);
        result = {
          status: 'failed',
          message: 'Internal server error',
          description: error.message,
          data: {},
        };
      }
    }

    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post(['/preview/:environmentId', '/preview'])
  async previewQuery(
    @User() user,
    @Body() updateDataQueryDto: UpdateDataQueryDto,
    @Param('environmentId') environmentId,
    @Res({ passthrough: true }) response: Response
  ) {
    const { options, query, app_version_id: appVersionId } = updateDataQueryDto;

    const app = await this.appsService.findAppFromVersion(appVersionId);

    if (!(query['data_source_id'] || appVersionId || environmentId)) {
      throw new BadRequestException('Data source id or app version id or environment id is mandatory');
    }

    const kind = query ? query['kind'] : null;
    const dataQueryEntity = {
      ...query,
      app,
      dataSource: query['data_source_id']
        ? await this.dataSourcesService.findOne(query['data_source_id'])
        : await this.dataSourcesService.findDefaultDataSourceByKind(kind, appVersionId),
    };

    const ability = await this.appsAbilityFactory.appsActions(user, app.id);

    if (!ability.can('previewQuery', app)) {
      throw new ForbiddenException('you do not have permissions to perform this action');
    }

    let result = {};

    try {
      result = await this.dataQueriesService.runQuery(user, dataQueryEntity, options, response, environmentId);
    } catch (error) {
      if (error.constructor.name === 'QueryError') {
        result = {
          status: 'failed',
          message: error.message,
          description: error.description,
          data: error.data,
        };
      } else {
        console.log(error);
        result = {
          status: 'failed',
          message: 'Internal server error',
          description: error.message,
          data: {},
        };
      }
    }

    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/data_source')
  async changeQueryDataSource(@User() user, @Param('id') queryId, @Body() updateDataQueryDto: UpdateDataQueryDto) {
    const { data_source_id: dataSourceId } = updateDataQueryDto;

    const dataQuery = await this.dataQueriesService.findOne(queryId);
    const dataSource = await this.dataSourcesService.findOne(dataSourceId);

    const ability = await this.appsAbilityFactory.appsActions(user, dataQuery.app.id);
    const globalDataSourceAbility = await this.globalDataSourcesAbilityFactory.globalDataSourceActions(
      user,
      dataSource.id
    );

    if (!ability.can('updateQuery', dataQuery.app)) {
      throw new ForbiddenException('you do not have permissions to perform this action');
    }

    if (
      dataSource.scope === DataSourceScopes.GLOBAL &&
      !(
        globalDataSourceAbility.can('createGlobalDataSource', dataSource) ||
        globalDataSourceAbility.can('updateGlobalDataSource', dataSource) ||
        globalDataSourceAbility.can('readGlobalDataSource', dataSource) ||
        globalDataSourceAbility.can('deleteGlobalDataSource', dataSource)
      )
    ) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }
    await this.dataQueriesService.changeQueryDataSource(queryId, dataSourceId);
    return;
  }

  async validateQueryActionsAgainstEnvironment(organizationId: string, appVersionId: string, errorMessage: string) {
    return dbTransactionWrap(async (manager: EntityManager) => {
      if (appVersionId) {
        const environmentsCount = await manager.count(AppEnvironment, {
          where: {
            organizationId,
          },
        });
        const currentEnvironment = await manager
          .createQueryBuilder('app_versions', 'av')
          .select('ae.*')
          .innerJoin('app_environments', 'ae', 'av.current_environment_id = ae.id')
          .where('av.id = :id', { id: appVersionId })
          .getRawOne();
        //TODO: Remove this once the currentEnvironment nul intermittent issue is completly fixed.
        if (!currentEnvironment) {
          const appVersion = await manager.findOne(AppVersion, {
            where: {
              id: appVersionId,
            },
          });
          console.log('ERROR_CURRENT_ENVIRONMENT_NULL_FOR_QUERY_CREATION', appVersion);
        }
        const isPromotedVersion = environmentsCount > 1 && currentEnvironment && currentEnvironment?.priority !== 1;
        if (isPromotedVersion) {
          throw new BadRequestException(errorMessage);
        }
      }
    });
  }
}
