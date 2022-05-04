import { Body, Controller, Post, Patch, Request, UseGuards, Get } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { PasswordRevalidateGuard } from 'src/modules/auth/password-revalidate.guard';
import { UsersService } from 'src/services/users.service';
import { CreateUserDto, UpdateUserDto } from '@dto/user.dto';
import { CheckPolicies } from 'src/modules/casl/check_policies.decorator';
import { PoliciesGuard } from 'src/modules/casl/policies.guard';
import { AppAbility } from 'src/modules/casl/casl-ability.factory';
import { User } from 'src/entities/user.entity';
import { decamelizeKeys } from 'humps';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('set_password_from_token')
  async create(@Request() req, @Body() userCreateDto: CreateUserDto) {
    const result = await this.usersService.setupAccountFromInvitationToken(req, userCreateDto);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('update')
  async update(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    const { first_name, last_name } = updateUserDto;
    await this.usersService.update(req.user.id, {
      firstName: first_name,
      lastName: last_name,
    });
    await req.user.reload();
    return {
      first_name: req.user.firstName,
      last_name: req.user.lastName,
    };
  }

  @UseGuards(JwtAuthGuard, PasswordRevalidateGuard)
  @Patch('change_password')
  async changePassword(@Request() req, @Body() body) {
    const { newPassword } = body;
    return await this.usersService.update(req.user.id, {
      password: newPassword,
    });
  }

  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability: AppAbility) => ability.can('fetchAllUsers', User))
  @Get()
  async index(@Request() req) {
    const users = await this.usersService.findAll(req.user.organizationId);
    return decamelizeKeys({ users });
  }
}
