import React from 'react';
import { instanceSettingsService, authenticationService, licenseService } from '@/_services';
import { toast } from 'react-hot-toast';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import { withTranslation } from 'react-i18next';
import ErrorBoundary from '@/Editor/ErrorBoundary';
import Skeleton from 'react-loading-skeleton';
import { ButtonSolid } from '@/_ui/AppButton/AppButton';
import _ from 'lodash';
import { LicenseBannerCloud } from '@/LicenseBannerCloud';

class ManageInstanceSettingsComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      currentUser: authenticationService.currentUserValue,
      isSaving: false,
      isLoading: false,
      errors: {},
      settings: [],
      options: {},
      hasChanges: false,
      disabled: false,
      initialOptions: {},
      featureAccess: {},
    };
  }

  componentDidMount() {
    this.fetchFeatureAccess();
    this.fetchSettings();
  }

  setDisabledStatus = (licenseStatus) => {
    const disabled = licenseStatus?.isExpired || !licenseStatus?.isLicenseValid;
    this.setState({ disabled });
  };

  fetchFeatureAccess = () => {
    this.setState({ isLoading: true });
    licenseService.getFeatureAccess().then((data) => {
      this.setDisabledStatus(data?.licenseStatus);
      this.setState({ isLoading: false, featureAccess: data });
    });
  };

  fetchSettings = () => {
    this.setState({ isLoading: true });
    instanceSettingsService
      .fetchSettings()
      .then((data) => {
        this.setInitialValues(data);
        this.setState({ isLoading: false, hasChanges: false });
      })
      .catch(({ error }) => {
        toast.error(error, { position: 'top-center' });
        this.setState({ isLoading: false });
      });
  };

  setInitialValues = (data) => {
    this.setState({
      settings: data,
      options: _.cloneDeep(data?.settings),
      initialOptions: _.cloneDeep(data?.settings),
    });
  };

  reset = () => {
    this.setState({ options: this.state.initialOptions }, () => this.checkForChanges());
  };

  saveSettings = () => {
    this.setState({ isSaving: true });
    instanceSettingsService
      .update(this.state.options)
      .then(() => {
        toast.success('Instance settings have been updated', {
          position: 'top-center',
        });
        this.setState({ isSaving: false, hasChanges: false });
        this.fetchSettings();
      })
      .catch(({ error }) => {
        toast.error(error, { position: 'top-center' });
        this.setState({ isSaving: false });
      });
  };

  returnBooleanValue = (value) => (value === 'true' ? true : false);

  checkForChanges = () => {
    const hasChanges = !_.isEqual(this.state.options, this.state.initialOptions);
    this.setState({ hasChanges });
  };

  optionsChanged = (key) => {
    const index = this.state.options.findIndex((option) => option.key === key);
    const newOptions = _.cloneDeep(this.state.options);
    const newValue = !this.returnBooleanValue(newOptions[index]?.value);
    newOptions[index].value = newValue.toString();
    this.setState(
      {
        options: [...newOptions],
      },
      () => this.checkForChanges()
    );
  };

  render() {
    const { options, isSaving, disabled, isLoading, hasChanges, featureAccess } = this.state;
    const isTrial = featureAccess?.licenseStatus?.licenseType === 'trial';
    return (
      <ErrorBoundary showFallback={true}>
        <div className="wrapper instance-settings-page animation-fade">
          <ReactTooltip type="dark" effect="solid" delayShow={250} />

          <div className="page-wrapper">
            <div className="container-xl">
              <div className="card">
                <div className="card-header">
                  <div className="title-banner-wrapper">
                    <div className="card-title" data-cy="card-title">
                      {this.props.t(
                        'header.organization.menus.manageInstanceSettings.instanceSettings',
                        'Manage instance settings'
                      )}
                    </div>
                    {(disabled || isTrial) && (
                      <LicenseBannerCloud isAvailable={false} showPaidFeatureBanner={true}></LicenseBannerCloud>
                    )}
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div
                  className="card-content"
                  style={{
                    display: 'flex',
                    width: '370px',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  {!isLoading && Object.entries(options) != 0 ? (
                    <form noValidate>
                      {options.map((option) => (
                        <div key={option?.key} className="form-group mb-3">
                          {option && (
                            <label className="form-check form-switch">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                onChange={() => this.optionsChanged(option?.key)}
                                checked={option.value === 'true'}
                                data-cy="form-check-input"
                                disabled={disabled}
                              />
                              <span className="form-check-label" data-cy="form-check-label">
                                {this.props.t(option?.label_key, option?.label)}
                              </span>
                              <div className="help-text">
                                <div data-cy="instance-settings-help-text">
                                  {this.props.t(option?.helper_text_key, option?.helper_text)}
                                </div>
                              </div>
                            </label>
                          )}
                        </div>
                      ))}
                    </form>
                  ) : (
                    <>
                      <div>
                        <Skeleton className="mb-2" />
                        <Skeleton />
                      </div>
                      <div className="row mt-4">
                        <div className=" col-1">
                          <Skeleton />
                        </div>
                        <div className="col-1">
                          <Skeleton />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="card-footer">
                <button type="button" className="btn btn-light mr-2" onClick={this.reset} data-cy="cancel-button">
                  {this.props.t('globals.cancel', 'Cancel')}
                </button>
                <ButtonSolid
                  onClick={this.saveSettings}
                  disabled={isSaving || disabled || !hasChanges}
                  data-cy="save-button"
                  variant="primary"
                  className={`btn mx-2 btn-primary ${isSaving ? 'btn-loading' : ''}`}
                  leftIcon="floppydisk"
                  fill="#fff"
                  iconWidth="20"
                >
                  {this.props.t('globals.savechanges', 'Save')}
                </ButtonSolid>
              </div>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }
}

export const ManageInstanceSettings = withTranslation()(ManageInstanceSettingsComponent);
