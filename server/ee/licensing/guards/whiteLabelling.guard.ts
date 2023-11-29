import { Injectable, CanActivate, ExecutionContext, HttpException } from '@nestjs/common';
import { LicenseService } from '@services/license.service';
import { LICENSE_FIELD } from 'src/helpers/license.helper';

@Injectable()
export class WhiteLabellingGuard implements CanActivate {
  constructor(private licenseService: LicenseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const organizationId = request.headers['tj-workspace-id'];
    if (!(await this.licenseService.getLicenseTerms(LICENSE_FIELD.WHITE_LABEL, organizationId))) {
      throw new HttpException('White labelling not enabled', 451);
    }
    return true;
  }
}
