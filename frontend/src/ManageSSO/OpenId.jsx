import React, { useState } from 'react';
import { organizationService } from '@/_services';
import { toast } from 'react-hot-toast';
import { copyToClipboard } from '@/_helpers/appUtils';
import { useTranslation } from 'react-i18next';
import SolidIcon from '@/_ui/Icon/SolidIcons';
import { ButtonSolid } from '@/_ui/AppButton/AppButton';
import Toggle from '@/_ui/Toggle/index';

export function OpenId({ settings, updateData }) {
  const [enabled, setEnabled] = useState(settings?.enabled || false);
  const [clientId, setClientId] = useState(settings?.configs?.client_id || '');
  const [clientSecret, setClientSecret] = useState(settings?.configs?.client_secret || '');
  const [name, setName] = useState(settings?.configs?.name || '');
  const [wellKnownUrl, setWellKnownUrl] = useState(settings?.configs?.well_known_url || '');
  const [isSaving, setSaving] = useState(false);
  const [configId, setConfigId] = useState(settings?.id);
  const { t } = useTranslation();

  const reset = () => {
    setClientId(settings?.configs?.client_id || '');
    setClientSecret(settings?.configs?.client_secret || '');
    setName(settings?.configs?.name || '');
    setWellKnownUrl(settings?.configs?.well_known_url || '');
  };

  const copyFunction = (input) => {
    let text = document.getElementById(input).innerHTML;
    copyToClipboard(text);
  };

  const saveSettings = () => {
    setSaving(true);
    organizationService
      .editOrganizationConfigs({
        type: 'openid',
        configs: { name, clientId, clientSecret, wellKnownUrl },
      })
      .then(
        (data) => {
          setSaving(false);
          data.id && setConfigId(data.id);
          updateData('openid', {
            id: data.id,
            configs: {
              client_id: clientId,
              client_secret: clientSecret,
              name: name,
              well_known_url: wellKnownUrl,
            },
          });
          toast.success('updated SSO configurations', {
            position: 'top-center',
          });
        },
        () => {
          setSaving(false);
          toast.error('Error saving sso configurations', {
            position: 'top-center',
          });
        }
      );
  };

  const changeStatus = () => {
    setSaving(true);
    organizationService.editOrganizationConfigs({ type: 'openid', enabled: !enabled }).then(
      (data) => {
        setSaving(false);
        const enabled_tmp = !enabled;
        setEnabled(enabled_tmp);
        data.id && setConfigId(data.id);
        updateData('openid', { id: data.id, enabled: enabled_tmp });
        toast.success(`${enabled_tmp ? 'Enabled' : 'Disabled'} OpenId SSO`, {
          position: 'top-center',
        });
      },
      () => {
        setSaving(false);
        toast.error('Error saving sso configurations', {
          position: 'top-center',
        });
      }
    );
  };

  return (
    <div className="sso-card-wrapper">
      <div className="card-header">
        <div className="d-flex justify-content-between title-with-toggle">
          <div>
            <Toggle
              label={t('header.organization.menus.manageSSO.openid.title', 'OpenID Connect')}
              onChange={changeStatus}
              checked={enabled}
              dataCy="openid"
            />
          </div>
          <div className="card-title">
            <span className={` tj-text-xsm ${enabled ? 'enabled-tag' : 'disabled-tag'}`} data-cy="status-label">
              {enabled ? t('globals.enabled', 'Enabled') : t('globals.disabled', 'Disabled')}
            </span>
          </div>
        </div>
      </div>
      <div className="card-body">
        <form noValidate className="sso-form-wrap">
          <div className="form-group mb-3">
            <label className="form-label">Name</label>
            <div>
              <input
                type="text"
                className="form-control"
                placeholder="Enter Name "
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Client Id</label>
            <div>
              <input
                type="text"
                className="form-control"
                placeholder="Enter Client Id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group mb-3">
            <label className="form-label" data-cy="client-secret-label">
              {t('header.organization.menus.manageSSO.github.clientSecret', 'Client Secret')}
              <small className="git- mx-2" data-cy="encripted-label">
                <SolidIcon name="lock" width="16" />
                {t('header.organization.menus.manageSSO.github.encrypted', 'Encrypted')}
              </small>
            </label>
            <div>
              <input
                type="text"
                className="form-control"
                placeholder="Enter Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Well Known URL</label>
            <div>
              <input
                type="text"
                className="form-control"
                placeholder="Enter Well Known URL"
                value={wellKnownUrl}
                onChange={(e) => setWellKnownUrl(e.target.value)}
              />
            </div>
          </div>
          {configId && (
            <div className="form-group mb-3">
              <label className="form-label" data-cy="redirect-url-label">
                {t('header.organization.menus.manageSSO.google.redirectUrl', 'Redirect URL')}
              </label>
              <div className="d-flex justify-content-between form-control">
                <p
                  data-cy="redirect-url"
                  id="redirect-url"
                >{`${window.public_config?.TOOLJET_HOST}/sso/openid/${configId}`}</p>
                <img
                  onClick={() => copyFunction('redirect-url')}
                  src={`assets/images/icons/copy-dark.svg`}
                  width="22"
                  height="22"
                  className="sso-copy"
                />
              </div>
            </div>
          )}
        </form>
      </div>
      <div className="form-footer sso-card-footer">
        <ButtonSolid onClick={reset} data-cy="cancel-button" variant="tertiary" className="sso-footer-cancel-btn">
          {t('globals.cancel', 'Cancel')}
        </ButtonSolid>

        <ButtonSolid
          disabled={isSaving}
          isLoading={isSaving}
          onClick={saveSettings}
          data-cy="save-button"
          variant="primary"
          className="sso-footer-save-btn"
          leftIcon="floppydisk"
          fill="#fff"
          iconWidth="20"
        >
          {t('globals.savechanges', 'Save changes')}
        </ButtonSolid>
      </div>
    </div>
  );
}
