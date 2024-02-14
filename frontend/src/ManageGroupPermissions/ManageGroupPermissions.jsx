import React from 'react';
import { groupPermissionService, licenseService } from '@/_services';
import { Tooltip } from 'react-tooltip';
import { ConfirmDialog } from '@/_components';
import { toast } from 'react-hot-toast';
import { withTranslation, useTranslation } from 'react-i18next';
import { ManageGroupPermissionResources } from '@/ManageGroupPermissionResources';
import ErrorBoundary from '@/Editor/ErrorBoundary';
import Modal from '../HomePage/Modal';
import { ButtonSolid } from '@/_ui/AppButton/AppButton';
import FolderList from '@/_ui/FolderList/FolderList';
import { Loader } from '../ManageSSO/Loader';
import { LicenseBanner } from '@/LicenseBanner';
import { LicenseTooltip } from '@/LicenseTooltip';
import _ from 'lodash';
import Popover from 'react-bootstrap/Popover';
import SolidIcon from '@/_ui/Icon/solidIcons/index';
import ModalBase from '@/_ui/Modal';
import OverflowTooltip from '@/_components/OverflowTooltip';
class ManageGroupPermissionsComponent extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      isLoading: true,
      groups: [],
      creatingGroup: false,
      showNewGroupForm: false,
      newGroupName: null,
      isDeletingGroup: false,
      isUpdatingGroupName: false,
      showGroupDeletionConfirmation: false,
      showGroupNameUpdateForm: false,
      groupToBeUpdated: null,
      isSaveBtnDisabled: false,
      selectedGroupPermissionId: null,
      selectedGroup: 'All users',
      featureAccess: null,
      isDuplicatingGroup: false,
      groupDuplicateOption: { addPermission: true, addApps: true, addDataSource: true, addUsers: true },
      showDuplicateGroupModal: false,
      groupToDuplicate: '',
    };
  }

  componentDidMount() {
    this.fetchFeatureAccess();
    this.fetchGroups();
  }

  findCurrentGroupDetails = (data) => {
    let currentUpdatedGroup = data.group_permissions.find((item) => {
      return item.group == this.state.newGroupName;
    });
    this.setState({ selectedGroup: currentUpdatedGroup.group });
    return currentUpdatedGroup.id;
  };

  fetchFeatureAccess = () => {
    licenseService.getFeatureAccess().then((data) => {
      this.setState({
        featureAccess: { ...data },
      });
    });
  };

  duplicateGroup = () => {
    const { groupDuplicateOption, groupToDuplicate } = this.state;
    this.setState({ isDuplicatingGroup: true, creatingGroup: true });
    groupPermissionService
      .duplicate(groupToDuplicate, groupDuplicateOption)
      .then((data) => {
        this.setState({
          newGroupName: data?.group,
        });
        this.fetchGroups('current', () => {
          this.setState({
            newGroupName: '',
            creatingGroup: false,
            selectedGroupPermissionId: data?.id,
            selectedGroup: data?.group,
            isDuplicatingGroup: false,
            showDuplicateGroupModal: false,
            groupDuplicateOption: { addPermission: true, addApps: true, addDataSource: true, addUsers: true },
          });
        });

        toast.success('Group duplicated successfully!');
      })
      .catch((err) => {
        this.setState({
          isDuplicatingGroup: false,
          groupDuplicateOption: { addPermission: true, addApps: true, addDataSource: true, addUsers: true },
          showDuplicateGroupModal: false,
        });
        console.error('Error occured in duplicating: ', err);
        toast.error('Could not duplicate group.\nPlease try again!');
      });
  };

  toggleShowDuplicateModal = () => {
    this.setState((prevState) => ({
      showDuplicateGroupModal: !prevState.showDuplicateGroupModal,
      groupToDuplicate: '',
      groupDuplicateOption: { addPermission: true, addApps: true, addDataSource: true, addUsers: true },
    }));
  };

  renderPopoverContent = (props, compoParam) => {
    const { groupName, id, isFeatureEnabled } = compoParam;
    const deleteGroup = () => {
      this.deleteGroup(id);
    };

    const duplicateGroup = () => {
      this.showDuplicateDiologBox(id);
    };

    const isDefaultGroup = groupName == 'all_users' || groupName == 'admin';

    return (
      <div
        {...props}
        style={{
          position: 'absolute',
          ...props.style,
        }}
      >
        <Popover
          id="popover-group-menu"
          className={this.props.darkMode ? 'popover-group-menu dark-theme' : 'popover-group-menu'}
          placement="bottom"
        >
          <Popover.Body bsPrefix="popover-body">
            <div>
              <Field
                customClass={this.props.darkMode ? 'dark-theme' : ''}
                leftIcon="copy"
                leftIconWidth="20"
                leftViewBox="0  0 20 20"
                text={'Duplicate group'}
                onClick={isFeatureEnabled && duplicateGroup}
                buttonDisable={!isFeatureEnabled}
                darkMode={this.props.darkMode}
              />
              <Field
                customClass={this.props.darkMode ? 'dark-theme' : ''}
                leftIcon="delete"
                leftIconWidth="18"
                leftIconHeight="18"
                leftViewBox="0  0 20 20"
                text={'Delete group'}
                tooltipId="tooltip-for-delete"
                tooltipContent="Cannot delete default group"
                onClick={isDefaultGroup ? {} : deleteGroup}
                buttonDisable={isDefaultGroup}
                darkMode={this.props.darkMode}
              />
            </div>
          </Popover.Body>
        </Popover>
        {isDefaultGroup && (
          <Tooltip
            id="tooltip-for-delete"
            className="tooltip"
            place="left"
            style={{
              zIndex: 99999,
            }}
            show={isDefaultGroup}
          />
        )}
      </div>
    );
  };

  fetchGroups = (type = 'admin', callback = () => {}) => {
    this.setState({
      isLoading: true,
    });

    groupPermissionService
      .getGroups()
      .then((data) => {
        this.setState(
          {
            groups: data.group_permissions,
            isLoading: false,
            selectedGroupPermissionId:
              type == 'admin'
                ? data.group_permissions[0].id
                : type == 'current'
                ? this.findCurrentGroupDetails(data)
                : data.group_permissions.at(-1).id,
          },
          callback
        );
      })
      .catch(({ error }) => {
        toast.error(error);
        this.setState({
          isLoading: false,
        });
      });
  };

  changeNewGroupName = (value) => {
    this.setState({
      newGroupName: value,
      isSaveBtnDisabled: false,
    });
    if ((this.state.groupToBeUpdated && this.state.groupToBeUpdated.group === value) || !value) {
      this.setState({
        isSaveBtnDisabled: true,
      });
    }
  };

  humanizeifDefaultGroupName = (groupName) => {
    switch (groupName) {
      case 'all_users':
        return 'All users';

      case 'admin':
        return 'Admin';

      default:
        return groupName;
    }
  };

  createGroup = () => {
    this.setState({ creatingGroup: true });
    groupPermissionService
      .create(this.state.newGroupName)
      .then(() => {
        this.setState({
          creatingGroup: false,
          showNewGroupForm: false,
          newGroupName: null,
          selectedGroup: this.state.newGroupName,
        });
        toast.success('Group has been created');
        this.fetchGroups('new');
      })
      .catch(({ error, data }) => {
        const { statusCode } = data;
        if ([451].indexOf(statusCode) === -1) {
          toast.error(error);
        }
        this.setState({
          creatingGroup: false,
          showNewGroupForm: true,
        });
      });
  };

  deleteGroup = (groupPermissionId) => {
    this.setState({
      showGroupDeletionConfirmation: true,
      groupToBeDeleted: groupPermissionId,
    });
  };

  updateGroupName = (groupPermission) => {
    this.setState({
      showGroupNameUpdateForm: true,
      groupToBeUpdated: groupPermission,
      newGroupName: groupPermission.group,
      isSaveBtnDisabled: true,
    });
  };

  cancelDeleteGroupDialog = () => {
    this.setState({
      isDeletingGroup: false,
      groupToBeDeleted: null,
      showGroupDeletionConfirmation: false,
    });
  };

  executeGroupDeletion = () => {
    this.setState({ isDeletingGroup: true });
    groupPermissionService
      .del(this.state.groupToBeDeleted)
      .then(() => {
        toast.success('Group deleted successfully');
        this.fetchGroups();
        this.setState({ selectedGroup: 'All users', isDeletingGroup: false });
      })
      .catch(({ error }) => {
        toast.error(error);
      })
      .finally(() => {
        this.cancelDeleteGroupDialog();
      });
  };

  showDuplicateDiologBox = (id) => {
    this.setState({ groupToDuplicate: id, showDuplicateGroupModal: true, isDuplicatingGroup: false });
  };

  executeGroupUpdation = () => {
    this.setState({ isUpdatingGroupName: true, selectedGroup: this.state.newGroupName });
    groupPermissionService
      .update(this.state.groupToBeUpdated?.id, { name: this.state.newGroupName })
      .then(() => {
        toast.success('Group name updated successfully');
        this.fetchGroups('current');
        this.setState({
          isUpdatingGroupName: false,
          groupToBeUpdated: null,
          showGroupNameUpdateForm: false,
        });
      })
      .catch(({ error }) => {
        toast.error(error);
        this.setState({
          isUpdatingGroupName: false,
        });
      });
  };

  render() {
    const {
      isLoading,
      showNewGroupForm,
      showGroupNameUpdateForm,
      creatingGroup,
      isUpdatingGroupName,
      groups,
      isDeletingGroup,
      showGroupDeletionConfirmation,
      featureAccess,
      showDuplicateGroupModal,
      isDuplicatingGroup,
      groupDuplicateOption,
    } = this.state;

    const { addPermission, addApps, addDataSource, addUsers } = groupDuplicateOption;
    const allFalse = [addPermission, addApps, addDataSource, addUsers].every((value) => !value);

    const isFeatureEnabled =
      !featureAccess?.licenseStatus?.isExpired &&
      featureAccess?.licenseStatus?.isLicenseValid &&
      featureAccess?.licenseStatus?.licenseType !== 'basic';

    return (
      <ErrorBoundary showFallback={true}>
        <div className="wrapper org-users-page animation-fade">
          <div className="org-users-page-container">
            <ConfirmDialog
              show={showGroupDeletionConfirmation}
              message={'This group will be permanently deleted. Do you want to continue?'}
              confirmButtonLoading={isDeletingGroup}
              onConfirm={() => this.executeGroupDeletion()}
              onCancel={() => this.cancelDeleteGroupDialog()}
              darkMode={this.props.darkMode}
            />
            <ModalBase
              show={showDuplicateGroupModal}
              handleConfirm={this.duplicateGroup}
              handleClose={this.toggleShowDuplicateModal}
              title="Duplicate group"
              confirmBtnProps={{ title: 'Duplicate', disabled: allFalse }}
              isLoading={isDuplicatingGroup}
              cancelDisabled={isDuplicatingGroup}
              darkMode={this.props.darkMode}
              data-cy="modal-title"
            >
              <div className="tj-text" data-cy="modal-message">
                Duplicate the following parts of the group
              </div>
              <div className="group-duplcate-modal-body">
                <div className="row check-row">
                  <div className="col-1 ">
                    <input
                      class="form-check-input"
                      checked={addUsers}
                      type="checkbox"
                      onChange={() => {
                        this.setState((prevState) => ({
                          groupDuplicateOption: {
                            ...prevState.groupDuplicateOption,
                            addUsers: !prevState.groupDuplicateOption.addUsers,
                          },
                        }));
                      }}
                      data-cy="users-check-input"
                    />
                  </div>
                  <div className="col-11">
                    <div className="tj-text " data-cy="users-label">
                      Users
                    </div>
                  </div>
                </div>
                <div className="row check-row">
                  <div className="col-1 ">
                    <input
                      class="form-check-input"
                      checked={addPermission}
                      type="checkbox"
                      onChange={() => {
                        this.setState((prevState) => ({
                          groupDuplicateOption: {
                            ...prevState.groupDuplicateOption,
                            addPermission: !prevState.groupDuplicateOption.addPermission,
                          },
                        }));
                      }}
                      data-cy="permissions-check-input"
                    />
                  </div>
                  <div className="col-11">
                    <div className="tj-text " data-cy="permissions-label">
                      Permissions
                    </div>
                  </div>
                </div>
                <div className="row check-row">
                  <div className="col-1 ">
                    <input
                      class="form-check-input"
                      checked={addApps}
                      type="checkbox"
                      onChange={() => {
                        this.setState((prevState) => ({
                          groupDuplicateOption: {
                            ...prevState.groupDuplicateOption,
                            addApps: !prevState.groupDuplicateOption.addApps,
                          },
                        }));
                      }}
                      data-cy="apps-check-input"
                    />
                  </div>
                  <div className="col-11">
                    <div className="tj-text " data-cy="apps-label">
                      Apps
                    </div>
                  </div>
                </div>
                <div className="row check-row">
                  <div className="col-1 ">
                    <input
                      class="form-check-input"
                      checked={addDataSource}
                      type="checkbox"
                      onChange={() => {
                        this.setState((prevState) => ({
                          groupDuplicateOption: {
                            ...prevState.groupDuplicateOption,
                            addDataSource: !prevState.groupDuplicateOption.addDataSource,
                          },
                        }));
                      }}
                      data-cy="datasources-check-input"
                    />
                  </div>
                  <div className="col-11">
                    <div className="tj-text " data-cy="datasources-label">
                      Datasources
                    </div>
                  </div>
                </div>
              </div>
            </ModalBase>
            <div className="d-flex groups-btn-container">
              <p className="tj-text" data-cy="page-title">
                {groups?.length} Groups
              </p>
              {!showNewGroupForm && !showGroupNameUpdateForm && (
                <LicenseTooltip
                  limits={featureAccess}
                  feature={'Custom groups'}
                  noTooltipIfValid={true}
                  isAvailable={isFeatureEnabled}
                  placement={'bottom'}
                  customMessage={'Custom groups can only be created in paid plans'}
                >
                  <ButtonSolid
                    className="btn btn-primary create-new-group-button"
                    onClick={(e) => {
                      e.preventDefault();
                      this.setState({ newGroupName: null, showNewGroupForm: true, isSaveBtnDisabled: true });
                    }}
                    data-cy="create-new-group-button"
                    leftIcon="plus"
                    isLoading={isLoading}
                    iconWidth="16"
                    fill={'#FDFDFE'}
                    disabled={!isFeatureEnabled}
                  >
                    {this.props.t(
                      'header.organization.menus.manageGroups.permissions.createNewGroup',
                      'Create new group'
                    )}
                  </ButtonSolid>
                </LicenseTooltip>
              )}
            </div>

            <Modal
              show={showNewGroupForm || showGroupNameUpdateForm}
              closeModal={() =>
                this.setState({
                  showNewGroupForm: false,
                  showGroupNameUpdateForm: false,
                  newGroupName: null,
                })
              }
              title={
                showGroupNameUpdateForm
                  ? this.props.t('header.organization.menus.manageGroups.permissions.updateGroup', 'Update group')
                  : this.props.t('header.organization.menus.manageGroups.permissions.addNewGroup', 'Add new group')
              }
            >
              <form
                id="my-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (showNewGroupForm) {
                    this.createGroup();
                  } else {
                    this.executeGroupUpdation();
                  }
                }}
              >
                <div className="form-group mb-3 ">
                  <div className="row">
                    <div className="col tj-app-input">
                      <input
                        type="text"
                        required
                        className="form-control"
                        placeholder={this.props.t(
                          'header.organization.menus.manageGroups.permissions.enterName',
                          'Enter group name'
                        )}
                        onChange={(e) => {
                          this.changeNewGroupName(e.target.value);
                        }}
                        value={this.state.newGroupName}
                        data-cy="group-name-input"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>
                <div className="form-footer d-flex create-group-modal-footer">
                  <ButtonSolid
                    onClick={() =>
                      this.setState({
                        showNewGroupForm: false,
                        showGroupNameUpdateForm: false,
                        newGroupName: null,
                      })
                    }
                    disabled={creatingGroup}
                    data-cy="cancel-button"
                    variant="tertiary"
                  >
                    {this.props.t('globals.cancel', 'Cancel')}
                  </ButtonSolid>
                  <ButtonSolid
                    type="submit"
                    id="my-form"
                    disabled={creatingGroup || this.state.isSaveBtnDisabled}
                    data-cy="create-group-button"
                    isLoading={creatingGroup || isUpdatingGroupName}
                    leftIcon="plus"
                    fill={creatingGroup || this.state.isSaveBtnDisabled ? '#4C5155' : '#FDFDFE'}
                  >
                    {showGroupNameUpdateForm
                      ? this.props.t('globals.save', 'Save')
                      : this.props.t('header.organization.menus.manageGroups.permissions.createGroup', 'Create Group')}
                  </ButtonSolid>
                </div>
              </form>
            </Modal>

            {!showNewGroupForm && !showGroupNameUpdateForm && (
              <div className="org-users-page-card-wrap">
                <div style={{ display: 'grid' }} className="org-users-page-sidebar">
                  <div>
                    {groups.map((permissionGroup, index) => {
                      const Wrapper = ({ children }) =>
                        !permissionGroup?.enabled ? (
                          <LicenseTooltip
                            limits={featureAccess}
                            feature={'Custom groups'}
                            isAvailable={false}
                            noTooltipIfValid={true}
                            customMessage={'Custom groups are available only in paid plans'}
                          >
                            {children}
                          </LicenseTooltip>
                        ) : (
                          <>{children}</>
                        );
                      return (
                        <Wrapper key={index}>
                          <FolderList
                            key={permissionGroup.id}
                            listId={permissionGroup.id}
                            overlayFunctionParam={{
                              id: permissionGroup.id,
                              groupName: permissionGroup.group,
                              isFeatureEnabled: isFeatureEnabled,
                            }}
                            selectedItem={
                              this.state.selectedGroup == this.humanizeifDefaultGroupName(permissionGroup.group)
                            }
                            onClick={() => {
                              if (!permissionGroup?.enabled) return;
                              this.setState({
                                selectedGroupPermissionId: permissionGroup.id,
                                selectedGroup: this.humanizeifDefaultGroupName(permissionGroup.group),
                              });
                            }}
                            toolTipText={this.humanizeifDefaultGroupName(permissionGroup.group)}
                            overLayComponent={this.renderPopoverContent}
                            className="groups-folder-list"
                            dataCy={this.humanizeifDefaultGroupName(permissionGroup.group)
                              .toLowerCase()
                              .replace(/\s+/g, '-')}
                          >
                            <span>
                              <OverflowTooltip>
                                {this.humanizeifDefaultGroupName(permissionGroup.group)}
                              </OverflowTooltip>
                            </span>
                          </FolderList>
                        </Wrapper>
                      );
                    })}
                  </div>
                  {!_.isEmpty(featureAccess) && !isFeatureEnabled && (
                    <LicenseBanner
                      style={{ alignSelf: 'flex-end', margin: '0px !important' }}
                      limits={featureAccess}
                      classes="group-banner"
                      size="xsmall"
                      type={featureAccess?.licenseStatus?.licenseType}
                      customMessage={'Custom groups & permissions are available in our paid plans.'}
                    />
                  )}
                </div>

                <div className="org-users-page-card-body">
                  {isLoading ? (
                    <Loader />
                  ) : (
                    <ManageGroupPermissionResources
                      groupPermissionId={this.state.selectedGroupPermissionId}
                      darkMode={this.props.darkMode}
                      selectedGroup={this.state.selectedGroup}
                      updateGroupName={this.updateGroupName}
                      deleteGroup={this.deleteGroup}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </ErrorBoundary>
    );
  }
}

export const ManageGroupPermissions = withTranslation()(ManageGroupPermissionsComponent);

const Field = ({
  text,
  onClick,
  customClass,
  leftIcon,
  leftIconWidth,
  leftIconHeight = '18',
  leftIconClassName,
  buttonDisable = false,
  tooltipContent = '',
  tooltipId = '',
  darkMode = false,
}) => {
  return (
    <div className={`field ${customClass ? ` ${customClass}` : ''}`}>
      <span
        className="row option-row"
        role="button"
        onClick={!buttonDisable && onClick}
        data-cy={`${text.toLowerCase().replace(/\s+/g, '-')}-card-option`}
        data-tooltip-content={tooltipContent}
        data-tooltip-id={tooltipId}
      >
        <div className={`col-2 ${leftIconClassName}`}>
          {leftIcon && (
            <SolidIcon
              name={leftIcon}
              width={leftIconWidth}
              height={leftIconHeight}
              {...(buttonDisable ? { fill: '#D7DBDF' } : {})}
            ></SolidIcon>
          )}
        </div>
        <div className={`col ${buttonDisable ? 'disable' : ''} ${darkMode ? 'dark-theme' : ''}`}>{text}</div>
      </span>
    </div>
  );
};
