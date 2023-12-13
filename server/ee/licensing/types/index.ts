import { LICENSE_TYPE } from 'src/helpers/license.helper';

export interface Terms {
  expiry: string; // YYYY-MM-DD
  apps?: number | string;
  workspaces?: number | string;
  users?: {
    total?: number | string;
    editor?: number | string;
    viewer?: number | string;
    superadmin?: number | string;
  };
  database?: {
    table?: number | string;
  };
  domains?: Array<{ hostname?: string; subpath?: string }>;
  features?: {
    oidc?: boolean;
    auditLogs?: boolean;
    ldap?: boolean;
    saml?: boolean;
    customStyling?: boolean;
    whiteLabelling?: boolean;
    multiEnvironment?: boolean;
    multiPlayerEdit?: boolean;
    gitSync?: boolean;
    comments?: boolean;
  };
  type?: LICENSE_TYPE;
  auditLogs?: {
    maximumDays?: number | string;
  };
  meta?: {
    customerName?: string;
    generatedFrom?: 'API';
    customerId?: string;
    createdBy?: string;
  };
}
