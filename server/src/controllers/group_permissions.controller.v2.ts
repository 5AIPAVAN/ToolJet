import { CreateGranularPermissionDto, UpdateGranularPermissionDto } from '@dto/granular-permissions.dto';
import {
  AddGroupUserDto,
  CreateGroupPermissionDto,
  EditUserRoleDto,
  UpdateGroupPermissionDto,
} from '@dto/group_permissions.dto';
import { JwtAuthGuard } from '@module/auth/jwt-auth.guard';
import { GroupPermissionsUtilityService } from '@module/user_resource_permissions/services/group-permissions.utility.service';
import {
  validateGranularPermissionCreateOperation,
  validateGranularPermissionUpdateOperation,
} from '@module/user_resource_permissions/utility/granular-permissios.utility';
import {
  validateCreateGroupOperation,
  validateDeleteGroupUserOperation,
} from '@module/user_resource_permissions/utility/group-permissions.utility';
import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { GranularPermissionsService } from '@services/granular_permissions.service';
import { GroupPermissionsServiceV2 } from '@services/group_permissions.service.v2';
import { UserRoleService } from '@services/user-role.service';
import { User } from 'src/decorators/user.decorator';
import { GranularPermissions } from 'src/entities/granular_permissions.entity';

@Controller({
  path: 'group_permissions',
  version: '2',
})
export class GroupPermissionsControllerV2 {
  constructor(
    private groupPermissionsService: GroupPermissionsServiceV2,
    private userRoleService: UserRoleService,
    private granularPermissionsService: GranularPermissionsService,
    private groupPermissionUtilityService: GroupPermissionsUtilityService
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@User() user, @Body() createGroupPermissionDto: CreateGroupPermissionDto) {
    /* 
    License Validation check - 
      1. CE - Anyone can create custom groups
      2. EE/Cloud - Basic Plan - Cant create custom group
            - Paid Plan - Can create custom group
    */
    validateCreateGroupOperation(createGroupPermissionDto);
    const { organizationId } = user;
    return await this.groupPermissionsService.create(organizationId, createGroupPermissionDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async get(@User() user, @Param('id') id: string) {
    return await this.groupPermissionsService.getGroup(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll(@User() user) {
    const { organizationId } = user;
    return await this.groupPermissionsService.getAllGroup(organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@User() user, @Param('id') id: string, @Body() updateGroupDto: UpdateGroupPermissionDto) {
    /* 
    License Validation check - 
      1. CE - Anyone can create update custom groups but no'one can update defaul group
      2. EE/Cloud - Basic Plan - No'one can update custom and default group
            - Paid Plan - Can update only custom and default -builder custom group
    */
    return await this.groupPermissionsService.updateGroup(id, updateGroupDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@User() user, @Param('id') id: string) {
    return await this.groupPermissionsService.deleteGroup(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('group-user')
  async createGroupUsers(@User() user, @Body() addGroupUserDto: AddGroupUserDto) {
    const { organizationId } = user;
    return await this.groupPermissionsService.addGroupUsers(addGroupUserDto, organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':groupId/group-user')
  async getAllGroupUser(@User() user, @Param('groupId') groupId: string, @Query('input') searchInput: string) {
    return await this.groupPermissionsService.getAllGroupUsers(groupId, searchInput);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('group-user/:id')
  async deleteGroupUser(@User() user, @Param('id') id: string) {
    const groupUser = await this.groupPermissionsService.getGroupUser(id);
    validateDeleteGroupUserOperation(groupUser?.group);
    return await this.groupPermissionsService.deleteGroupUser(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':groupId/group-user/addable-users')
  async getAddableGroupUser(@User() user, @Param('groupId') groupId: string, @Query('input') searchInput: string) {
    return await this.groupPermissionUtilityService.getAddableUser(user, groupId, searchInput.trim());
  }

  @UseGuards(JwtAuthGuard)
  @Get('granular-permissions/addable-apps')
  async getAddableApps(@User() user) {
    return await this.groupPermissionUtilityService.getAddableApps(user);
  }

  @UseGuards(JwtAuthGuard)
  @Put('user-role/edit')
  async updateUserRole(@User() user, @Body() editRoleDto: EditUserRoleDto) {
    /* 

     What are license thing for this
    License Validation check - 
      1. CE - Anyone can create update custom groups but no'one can update defaul group
      2. EE/Cloud - Basic Plan - No'one can update custom and default group
            - Paid Plan - Can update only custom and default -builder custom group
    */
    const { organizationId } = user;
    return await this.userRoleService.editDefaultGroupUserRole(editRoleDto, organizationId);
  }

  //Should be not be part of current CE
  @UseGuards(JwtAuthGuard)
  @Post('granular-permissions')
  async createGranularPermissions(@User() user, @Body() createGranularPermissionsDto: CreateGranularPermissionDto) {
    //Check for license validation first here
    // What are license validation for this
    const { groupId, createAppsPermissionsObject } = createGranularPermissionsDto;
    const group = await this.groupPermissionsService.getGroup(groupId);
    console.log('creating granular');

    console.log(group);

    validateGranularPermissionCreateOperation(group);
    return await this.granularPermissionsService.create(createGranularPermissionsDto, createAppsPermissionsObject);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':groupId/granular-permissions')
  async getAllGranularPermissions(@User() user, @Param('groupId') groupId: string): Promise<GranularPermissions[]> {
    const granularPermissions: GranularPermissions[] = await this.granularPermissionsService.getAll({
      groupId: groupId,
    });
    return granularPermissions;
  }

  @UseGuards(JwtAuthGuard)
  @Put('granular-permissions/update/:id')
  async updateGranularPermissions(
    @User() user,
    @Param('id') granularPermissionsId: string,
    @Body() updateGranularPermissionDto: UpdateGranularPermissionDto
  ) {
    //Check for license validation first here
    // What are license validation for this
    // const { groupId } = createGranularPermissionsDto;
    console.log('Updating this');
    console.log(granularPermissionsId);

    const granularPermissions = await this.granularPermissionsService.get(granularPermissionsId);

    console.log(granularPermissions);

    const group = granularPermissions.group;
    validateGranularPermissionUpdateOperation(group);
    return await this.granularPermissionsService.update(granularPermissionsId, {
      organizationId: group.organizationId,
      updateGranularPermissionDto,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('granular-permissions/:id')
  async deleteGranularPermissions(@User() user, @Param('id') granularPermissionsId: string): Promise<void> {
    await this.granularPermissionsService.delete(granularPermissionsId);
  }
}
