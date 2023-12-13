import React from 'react';
import cx from 'classnames';
import moment from 'moment';
import {
  appsService,
  folderService,
  authenticationService,
  libraryAppService,
  licenseService,
  gitSyncService,
} from '@/_services';
import { ConfirmDialog, AppModal } from '@/_components';
import Select from '@/_ui/Select';
import { Folders } from './Folders';
import { BlankPage } from './BlankPage';
import { toast } from 'react-hot-toast';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import Layout from '@/_ui/Layout';
import AppList from './AppList';
import TemplateLibraryModal from './TemplateLibraryModal/';
import HomeHeader from './Header';
import Modal from './Modal';
import configs from './Configs/AppIcon.json';
import { retrieveWhiteLabelText, getWorkspaceId } from '../_helpers/utils';
import { withTranslation } from 'react-i18next';
import { sample, isEmpty } from 'lodash';
import ExportAppModal from './ExportAppModal';
import Footer from './Footer';
import { OrganizationList } from '@/_components/OrganizationManager/List';
import { ButtonSolid } from '@/_ui/AppButton/AppButton';
import BulkIcon from '@/_ui/Icon/bulkIcons/index';
import { withRouter } from '@/_hoc/withRouter';
import { LicenseBanner } from '@/LicenseBanner';
import { LicenseTooltip } from '@/LicenseTooltip';
import ModalBase from '@/_ui/Modal';
import Skeleton from 'react-loading-skeleton';

const { iconList, defaultIcon } = configs;

const MAX_APPS_PER_PAGE = 9;
class HomePageComponent extends React.Component {
  constructor(props) {
    super(props);

    const currentSession = authenticationService.currentSessionValue;

    this.fileInput = React.createRef();
    this.state = {
      currentUser: {
        id: currentSession?.current_user.id,
        organization_id: currentSession?.current_organization_id,
      },
      users: null,
      isLoading: true,
      creatingApp: false,
      isDeletingApp: false,
      isCloningApp: false,
      isExportingApp: false,
      isImportingApp: false,
      isDeletingAppFromFolder: false,
      currentFolder: {},
      currentPage: 1,
      appSearchKey: '',
      appToBeDeleted: false,
      showAppDeletionConfirmation: false,
      showRemoveAppFromFolderConfirmation: false,
      showAddToFolderModal: false,
      apps: [],
      folders: [],
      meta: {
        count: 1,
        folders: [],
      },
      appOperations: {},
      showTemplateLibraryModal: false,
      app: {},
      appsLimit: {},
      featureAccess: {},
      newAppName: '',
      commitEnabled: false,
      fetchingOrgGit: false,
      orgGit: null,
      showGitRepositoryImportModal: false,
      fetchingAppsFromRepos: false,
      appsFromRepos: {},
      selectedAppRepo: null,
      importingApp: false,
      importingGitAppOperations: {},
      featuresLoaded: false,
      showCreateAppModal: false,
      showCreateAppFromTemplateModal: false,
      showImportAppModal: false,
      showCloneAppModal: false,
      showRenameAppModal: false,
      fileContent: '',
      fileName: '',
      selectedTemplate: null,
      deploying: false,
    };
  }

  async componentDidMount() {
    await Promise.all([
      this.fetchApps(1, this.state.currentFolder.id),
      this.fetchFolders(),
      this.fetchFeatureAccesss(),
      this.fetchAppsLimit(),
      this.fetchOrgGit(),
    ]);
    document.title = `${retrieveWhiteLabelText()} - Dashboard`;
  }

  componentDidUpdate(prevProps) {
    if (prevProps.appType != this.props.appType) {
      this.fetchFolders();
      this.fetchApps(1);
    }
  }

  fetchAppsLimit() {
    appsService.getAppsLimit().then((data) => {
      this.setState({ appsLimit: data?.appsCount });
    });
  }

  fetchFeatureAccesss = () => {
    licenseService.getFeatureAccess().then((data) => {
      this.setState({
        featureAccess: data,
        featuresLoaded: true,
      });
    });
  };

  fetchApps = (page = 1, folder, searchKey) => {
    const appSearchKey = searchKey !== '' ? searchKey || this.state.appSearchKey : '';
    this.setState({
      apps: [],
      isLoading: true,
      currentPage: page,
      appSearchKey,
    });
    appsService.getAll(page, folder, appSearchKey, this.props.appType).then((data) => {
      this.setState({
        apps: data.apps,
        meta: { ...this.state.meta, ...data.meta },
        isLoading: false,
      });
    });
  };

  fetchFolders = (searchKey) => {
    const appSearchKey = searchKey !== '' ? searchKey || this.state.appSearchKey : '';
    this.setState({
      foldersLoading: true,
      appSearchKey: appSearchKey,
    });

    folderService.getAll(appSearchKey, this.props.appType).then((data) => {
      const folder_slug = new URL(window.location.href)?.searchParams?.get('folder');
      const folder = data?.folders?.find((folder) => folder.name === folder_slug);
      const currentFolderId = folder ? folder.id : this.state.currentFolder?.id;
      const currentFolder = data?.folders?.find((folder) => currentFolderId && folder.id === currentFolderId);
      this.setState({
        folders: data.folders,
        foldersLoading: false,
        currentFolder: currentFolder || {},
      });
      currentFolder && this.fetchApps(1, currentFolder.id);
    });
  };

  pageChanged = (page) => {
    this.fetchApps(page, this.state.currentFolder.id);
  };

  folderChanged = (folder) => {
    this.setState({ currentFolder: folder });
    this.fetchApps(1, folder.id);
  };

  foldersChanged = () => {
    this.fetchFolders();
  };

  createApp = async (appName) => {
    let _self = this;
    _self.setState({ creatingApp: true });
    try {
      const data = await appsService.createApp({ icon: sample(iconList), name: appName, type: this.props.appType });
      const workspaceId = getWorkspaceId();
      _self.props.navigate(`/${workspaceId}/apps/${data.id}`, { state: { commitEnabled: this.state.commitEnabled } });
      toast.success(`${this.props.appType === 'workflow' ? 'Workflow' : 'App'} created successfully!`);
      _self.setState({ creatingApp: false });
      return true;
    } catch (errorResponse) {
      _self.setState({ creatingApp: false });
      if (errorResponse.statusCode === 409) {
        return false;
      } else if (errorResponse.statusCode !== 451) {
        throw errorResponse;
      }
    }
  };

  renameApp = async (newAppName, appId) => {
    let _self = this;
    _self.setState({ renamingApp: true });
    try {
      await appsService.saveApp(appId, { name: newAppName });
      await this.fetchApps();
      toast.success('App name has been updated!');
      _self.setState({ renamingApp: false });
      return true;
    } catch (errorResponse) {
      _self.setState({ renamingApp: false });
      if (errorResponse.statusCode === 409) {
        return false;
      } else if (errorResponse.statusCode !== 451) {
        throw errorResponse;
      }
    }
  };

  deleteApp = (app) => {
    this.setState({ showAppDeletionConfirmation: true, appToBeDeleted: app });
  };

  cloneApp = async (appName, appId) => {
    this.setState({ isCloningApp: true });
    try {
      const data = await appsService.cloneResource({
        app: [{ id: appId, name: appName }],
        organization_id: this.state.currentUser?.organization_id,
      });
      toast.success('App cloned successfully!');
      this.props.navigate(`/${getWorkspaceId()}/apps/${data?.imports?.app[0]?.id}`, {
        state: { commitEnabled: this.state.commitEnabled },
      });
      this.setState({ isCloningApp: false });
      return true;
    } catch (_error) {
      this.setState({ isCloningApp: false });
      if (_error.statusCode === 409) {
        return false;
      } else if (_error.statusCode !== 451) {
        throw _error;
      }
    }
  };

  exportApp = async (app) => {
    this.setState({ isExportingApp: true, app: app });
  };

  readAndImport = (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;

      const fileReader = new FileReader();
      const fileName = file.name.replace('.json', '').substring(0, 50);
      fileReader.readAsText(file, 'UTF-8');
      fileReader.onload = (event) => {
        const result = event.target.result;
        let fileContent;
        try {
          fileContent = JSON.parse(result);
        } catch (parseError) {
          toast.error(`Could not import: ${parseError}`);
          return;
        }
        this.setState({ fileContent, fileName, showImportAppModal: true });
      };
      fileReader.onerror = (error) => {
        toast.error(`Could not import the app: ${error}`);
        return;
      };
      event.target.value = null;
    } catch (error) {
      toast.error(error.message);
    }
  };

  importFile = async (importJSON, appName) => {
    this.setState({ isImportingApp: true });
    // For backward compatibility with legacy app import
    const organization_id = this.state.currentUser?.organization_id;
    const isLegacyImport = isEmpty(importJSON.tooljet_version);
    if (isLegacyImport) {
      importJSON = { app: [{ definition: importJSON, appName: appName }], tooljet_version: importJSON.tooljetVersion };
    } else {
      importJSON.app[0].appName = appName;
    }
    const requestBody = { organization_id, ...importJSON };
    try {
      const data = await appsService.importResource(requestBody);
      toast.success('App imported successfully.');
      this.setState({
        isImportingApp: false,
      });
      if (!isEmpty(data.imports.app)) {
        this.props.navigate(`/${getWorkspaceId()}/apps/${data.imports.app[0].id}`, {
          state: { commitEnabled: this.state.commitEnabled },
        });
      } else if (!isEmpty(data.imports.tooljet_database)) {
        this.props.navigate(`/${getWorkspaceId()}/database`);
      }
    } catch (error) {
      this.setState({
        isImportingApp: false,
      });
      if (error.statusCode === 409) {
        return false;
      }
      toast.error("Couldn't import the app");
    }
  };

  deployApp = async (event, appName, selectedApp) => {
    event.preventDefault();
    const id = selectedApp.id;
    this.setState({ deploying: true });
    try {
      const data = await libraryAppService.deploy(id, appName);
      this.setState({ deploying: false });
      toast.success('App created successfully!', { position: 'top-center' });
      this.props.navigate(`/${getWorkspaceId()}/apps/${data.app[0].id}`, {
        state: { commitEnabled: this.state.commitEnabled },
      });
    } catch (e) {
      this.setState({ deploying: false });
      if (e.statusCode === 409) {
        return false;
      } else {
        return e;
      }
    }
  };

  canUserPerform(user, action, app) {
    const currentSession = authenticationService.currentSessionValue;
    let permissionGrant;

    switch (action) {
      case 'create':
        permissionGrant = this.canAnyGroupPerformAction('app_create', currentSession.group_permissions);
        break;
      case 'read':
      case 'update':
        permissionGrant =
          this.canAnyGroupPerformActionOnApp(action, currentSession.app_group_permissions, app) ||
          this.isUserOwnerOfApp(user, app);
        break;
      case 'delete':
        permissionGrant =
          this.canAnyGroupPerformActionOnApp('delete', currentSession.app_group_permissions, app) ||
          this.canAnyGroupPerformAction('app_delete', currentSession.group_permissions) ||
          this.isUserOwnerOfApp(user, app);
        break;
      default:
        permissionGrant = false;
        break;
    }

    return permissionGrant;
  }

  canAnyGroupPerformActionOnApp(action, appGroupPermissions, app) {
    if (authenticationService.currentSessionValue?.super_admin) {
      return true;
    }
    if (!appGroupPermissions) {
      return false;
    }

    const permissionsToCheck = appGroupPermissions.filter((permission) => permission.app_id == app.id);
    return this.canAnyGroupPerformAction(action, permissionsToCheck);
  }

  canAnyGroupPerformAction(action, permissions) {
    if (authenticationService.currentSessionValue?.super_admin) {
      return true;
    }
    if (!permissions) {
      return false;
    }

    return permissions.some((p) => p[action]);
  }

  isUserOwnerOfApp(user, app) {
    return user.id == app.user_id;
  }

  canCreateApp = () => {
    return this.canUserPerform(this.state.currentUser, 'create');
  };

  canUpdateApp = (app) => {
    return this.canUserPerform(this.state.currentUser, 'update', app);
  };

  canDeleteApp = (app) => {
    return this.canUserPerform(this.state.currentUser, 'delete', app);
  };

  canCreateFolder = () => {
    return this.canAnyGroupPerformAction('folder_create', authenticationService.currentSessionValue?.group_permissions);
  };

  canDeleteFolder = () => {
    return this.canAnyGroupPerformAction('folder_delete', authenticationService.currentSessionValue?.group_permissions);
  };

  canUpdateFolder = () => {
    return this.canAnyGroupPerformAction('folder_update', authenticationService.currentSessionValue?.group_permissions);
  };

  cancelDeleteAppDialog = () => {
    this.setState({
      isDeletingApp: false,
      appToBeDeleted: null,
      showAppDeletionConfirmation: false,
    });
  };

  executeAppDeletion = () => {
    this.setState({ isDeletingApp: true });
    appsService
      .deleteApp(this.state.appToBeDeleted.id)
      // eslint-disable-next-line no-unused-vars
      .then((data) => {
        toast.success('App deleted successfully.');
        this.fetchApps(
          this.state.currentPage
            ? this.state.apps?.length === 1
              ? this.state.currentPage - 1
              : this.state.currentPage
            : 1,
          this.state.currentFolder.id
        );
        this.fetchFolders();
        this.fetchAppsLimit();
        this.fetchFeatureAccesss();
      })
      .catch(({ error }) => {
        toast.error('Could not delete the app.');
        console.log(error);
      })
      .finally(() => {
        this.cancelDeleteAppDialog();
      });
  };

  pageCount = () => {
    return this.state.currentFolder.id ? this.state.meta.folder_count : this.state.meta.total_count;
  };

  onSearchSubmit = (key) => {
    if (this.state.appSearchKey === key) {
      return;
    }
    this.fetchApps(1, this.state.currentFolder.id, key || '');
  };

  fetchOrgGit = () => {
    const workspaceId = authenticationService.currentSessionValue.current_organization_id;
    this.setState({ fetchingOrgGit: true });
    gitSyncService
      .getGitConfig(workspaceId)
      .then((data) => {
        this.setState({ orgGit: data?.organization_git });
      })
      .finally(() => {
        this.setState({ fetchingOrgGit: false });
      });
  };

  fetchRepoApps = () => {
    this.setState({ fetchingAppsFromRepos: true, selectedAppRepo: null, importingGitAppOperations: {} });
    gitSyncService
      .gitPull()
      .then((data) => {
        this.setState({ appsFromRepos: data?.meta_data });
      })
      .catch((error) => {
        toast.error(error?.error);
      })
      .finally(() => {
        this.setState({ fetchingAppsFromRepos: false });
      });
  };

  importGitApp = () => {
    const { appsFromRepos, selectedAppRepo, orgGit } = this.state;
    const appToImport = appsFromRepos[selectedAppRepo];
    const { git_app_name, git_version_id, git_version_name, last_commit_message, last_commit_user, lastpush_date } =
      appToImport;

    this.setState({ importingApp: true });
    const body = {
      gitAppId: selectedAppRepo,
      gitAppName: git_app_name,
      gitVersionName: git_version_name,
      gitVersionId: git_version_id,
      lastCommitMessage: last_commit_message,
      lastCommitUser: last_commit_user,
      lastPushDate: new Date(lastpush_date),
      organizationGitId: orgGit?.id,
    };
    gitSyncService
      .importGitApp(body)
      .then((data) => {
        const workspaceId = getWorkspaceId();
        this.props.navigate(`/${workspaceId}/apps/${data.app.id}`);
      })
      .catch((error) => {
        this.setState({ importingGitAppOperations: { message: error?.error } });
      })
      .finally(() => {
        this.setState({ importingApp: false });
      });
  };

  addAppToFolder = () => {
    const { appOperations } = this.state;
    if (!appOperations?.selectedFolder || !appOperations?.selectedApp) {
      return toast.error('Select a folder');
    }
    this.setState({ appOperations: { ...appOperations, isAdding: true } });

    folderService
      .addToFolder(appOperations.selectedApp.id, appOperations.selectedFolder)
      .then(() => {
        toast.success('Added to folder.');
        this.foldersChanged();
        this.setState({ appOperations: {}, showAddToFolderModal: false });
      })
      .catch(({ error }) => {
        this.setState({ appOperations: { ...appOperations, isAdding: false } });
        toast.error(error);
      });
  };

  removeAppFromFolder = () => {
    const { appOperations } = this.state;
    if (!appOperations?.selectedFolder || !appOperations?.selectedApp) {
      return toast.error('Select a folder');
    }
    this.setState({ isDeletingAppFromFolder: true });

    folderService
      .removeAppFromFolder(appOperations.selectedApp.id, appOperations.selectedFolder.id)
      .then(() => {
        toast.success('Removed from folder.');

        this.fetchApps(1, appOperations.selectedFolder.id);
        this.fetchFolders();
      })
      .catch(({ error }) => {
        toast.error(error);
      })
      .finally(() => {
        this.setState({
          appOperations: {},
          isDeletingAppFromFolder: false,
          showRemoveAppFromFolderConfirmation: false,
        });
      });
  };

  appActionModal = (app, folder, action) => {
    const { appOperations } = this.state;

    switch (action) {
      case 'add-to-folder':
        this.setState({ appOperations: { ...appOperations, selectedApp: app }, showAddToFolderModal: true });
        break;
      case 'change-icon':
        this.setState({
          appOperations: { ...appOperations, selectedApp: app, selectedIcon: app?.icon },
          showChangeIconModal: true,
        });
        break;
      case 'remove-app-from-folder':
        this.setState({
          appOperations: { ...appOperations, selectedApp: app, selectedFolder: folder },
          showRemoveAppFromFolderConfirmation: true,
        });
        break;
      case 'clone-app':
        this.setState({
          appOperations: { ...appOperations, selectedApp: app, selectedIcon: app?.icon },
          showCloneAppModal: true,
        });
        break;
      case 'rename-app':
        this.setState({
          appOperations: { ...appOperations, selectedApp: app },
          showRenameAppModal: true,
        });
        break;
    }
  };

  getIcons = () => {
    const { appOperations } = this.state;
    const selectedIcon = appOperations.selectedIcon || appOperations.selectedApp?.icon || defaultIcon;
    return iconList.map((icon, index) => (
      <li
        className={`p-3 ms-1 me-2 mt-1 mb-2${selectedIcon === icon ? ' selected' : ''}`}
        onClick={() => this.setState({ appOperations: { ...appOperations, selectedIcon: icon } })}
        key={index}
      >
        <BulkIcon name={icon} data-cy={`${icon}-icon`} />
      </li>
    ));
  };

  changeIcon = () => {
    const { appOperations, apps } = this.state;

    if (!appOperations?.selectedIcon || !appOperations?.selectedApp) {
      return toast.error('Select an icon');
    }
    if (appOperations.selectedIcon === appOperations.selectedApp.icon) {
      this.setState({ appOperations: {}, showChangeIconModal: false });
      return toast.success('Icon updated.');
    }
    this.setState({ appOperations: { ...appOperations, isAdding: true } });

    appsService
      .changeIcon(appOperations.selectedIcon, appOperations.selectedApp.id)
      .then(() => {
        toast.success('Icon updated.');

        const updatedApps = apps.map((app) => {
          if (app.id === appOperations.selectedApp.id) {
            app.icon = appOperations.selectedIcon;
          }
          return app;
        });
        this.setState({ appOperations: {}, showChangeIconModal: false, apps: updatedApps });
      })
      .catch(({ error }) => {
        this.setState({ appOperations: { ...appOperations, isAdding: false } });
        toast.error(error);
      });
  };

  generateOptionsForRepository = () => {
    const { appsFromRepos } = this.state;
    return Object.keys(appsFromRepos).map((gitAppId) => ({
      name: appsFromRepos[gitAppId].git_app_name,
      value: gitAppId,
    }));
  };

  handleNewAppNameChange = (e) => {
    this.setState({ newAppName: e.target.value });
  };
  showTemplateLibraryModal = () => {
    this.setState({ showTemplateLibraryModal: true });
  };
  hideTemplateLibraryModal = () => {
    this.setState({ showTemplateLibraryModal: false });
  };
  handleCommitEnableChange = (e) => {
    this.setState({ commitEnabled: e.target.checked });
  };
  toggleGitRepositoryImportModal = (e) => {
    if (!this.state.showGitRepositoryImportModal) this.fetchRepoApps();
    this.setState({ showGitRepositoryImportModal: !this.state.showGitRepositoryImportModal });
  };

  openCreateAppFromTemplateModal = (template) => {
    this.setState({ showCreateAppFromTemplateModal: true, selectedTemplate: template });
  };

  closeCreateAppFromTemplateModal = () => {
    this.setState({ showCreateAppFromTemplateModal: false, selectedTemplate: null });
  };

  openCreateAppModal = () => {
    this.setState({ showCreateAppModal: true });
  };

  closeCreateAppModal = () => {
    this.setState({ showCreateAppModal: false });
  };

  render() {
    const {
      apps,
      isLoading,
      creatingApp,
      meta,
      currentFolder,
      showAppDeletionConfirmation,
      showRemoveAppFromFolderConfirmation,
      isDeletingApp,
      isImportingApp,
      isDeletingAppFromFolder,
      appSearchKey,
      showAddToFolderModal,
      showChangeIconModal,
      showCloneAppModal,
      appOperations,
      isExportingApp,
      appToBeDeleted,
      app,
      appsLimit,
      featureAccess,
      commitEnabled,
      fetchingOrgGit,
      orgGit,
      showGitRepositoryImportModal,
      fetchingAppsFromRepos,
      selectedAppRepo,
      appsFromRepos,
      importingApp,
      importingGitAppOperations,
      featuresLoaded,
      showCreateAppModal,
      showImportAppModal,
      fileContent,
      fileName,
      showRenameAppModal,
      showCreateAppFromTemplateModal,
    } = this.state;
    return (
      <Layout switchDarkMode={this.props.switchDarkMode} darkMode={this.props.darkMode}>
        <div className="wrapper home-page">
          {showCreateAppModal && (
            <AppModal
              closeModal={this.closeCreateAppModal}
              processApp={this.createApp}
              show={this.openCreateAppModal}
              title={this.props.appType == 'workflow' ? 'Create workflow' : 'Create app'}
              actionButton={this.props.appType == 'workflow' ? '+ Create workflow' : '+ Create app'}
              actionLoadingButton={'Creating'}
              fetchingOrgGit={fetchingOrgGit}
              orgGit={orgGit}
              commitEnabled={commitEnabled}
              handleCommitEnableChange={this.handleCommitEnableChange}
              appType={this.props.appType}
            />
          )}
          {showCloneAppModal && (
            <AppModal
              closeModal={() => this.setState({ showCloneAppModal: false })}
              processApp={this.cloneApp}
              show={() => this.setState({ showCloneAppModal: true })}
              selectedAppId={appOperations?.selectedApp?.id}
              selectedAppName={appOperations?.selectedApp?.name}
              title={'Clone app'}
              actionButton={'Clone app'}
              actionLoadingButton={'Cloning'}
              fetchingOrgGit={fetchingOrgGit}
              orgGit={orgGit}
              commitEnabled={commitEnabled}
              handleCommitEnableChange={this.handleCommitEnableChange}
            />
          )}
          {showImportAppModal && (
            <AppModal
              closeModal={() => this.setState({ showImportAppModal: false })}
              processApp={this.importFile}
              fileContent={fileContent}
              show={() => this.setState({ showImportAppModal: true })}
              selectedAppName={fileName}
              title={'Import app'}
              actionButton={'Import app'}
              actionLoadingButton={'Importing'}
              fetchingOrgGit={fetchingOrgGit}
              orgGit={orgGit}
              commitEnabled={commitEnabled}
              handleCommitEnableChange={this.handleCommitEnableChange}
            />
          )}
          {showCreateAppFromTemplateModal && (
            <AppModal
              show={this.openCreateAppFromTemplateModal}
              templateDetails={this.state.selectedTemplate}
              processApp={this.deployApp}
              closeModal={this.closeCreateAppFromTemplateModal}
              title={'Create new app from template'}
              actionButton={'+ Create app'}
              actionLoadingButton={'Creating'}
              fetchingOrgGit={fetchingOrgGit}
              orgGit={orgGit}
              commitEnabled={commitEnabled}
              handleCommitEnableChange={this.handleCommitEnableChange}
            />
          )}
          {showRenameAppModal && (
            <AppModal
              show={() => this.setState({ showRenameAppModal: true })}
              closeModal={() => this.setState({ showRenameAppModal: false })}
              processApp={this.renameApp}
              selectedAppId={appOperations.selectedApp.id}
              selectedAppName={appOperations.selectedApp.name}
              title={'Rename app'}
              actionButton={'Rename app'}
              actionLoadingButton={'Renaming'}
            />
          )}
          <ConfirmDialog
            show={showAppDeletionConfirmation}
            message={this.props.t(
              'homePage.deleteAppAndData',
              'The app {{appName}} and the associated data will be permanently deleted, do you want to continue?',
              {
                appName: appToBeDeleted?.name,
              }
            )}
            confirmButtonLoading={isDeletingApp}
            onConfirm={() => this.executeAppDeletion()}
            onCancel={() => this.cancelDeleteAppDialog()}
            darkMode={this.props.darkMode}
            cancelButtonText="Cancel"
          />
          <ConfirmDialog
            show={showRemoveAppFromFolderConfirmation}
            message={this.props.t(
              'homePage.removeAppFromFolder',
              'The app will be removed from this folder, do you want to continue?'
            )}
            confirmButtonLoading={isDeletingAppFromFolder}
            onConfirm={() => this.removeAppFromFolder()}
            onCancel={() =>
              this.setState({
                appOperations: {},
                isDeletingAppFromFolder: false,
                showRemoveAppFromFolderConfirmation: false,
              })
            }
            darkMode={this.props.darkMode}
          />
          <ModalBase
            title={selectedAppRepo ? 'Import app' : 'Import app from git repository'}
            show={showGitRepositoryImportModal}
            handleClose={this.toggleGitRepositoryImportModal}
            handleConfirm={this.importGitApp}
            confirmBtnProps={{
              title: 'Import app',
              isLoading: importingApp,
              disabled: importingApp || !selectedAppRepo || importingGitAppOperations?.message,
            }}
          >
            {fetchingAppsFromRepos ? (
              <div className="loader-container">
                <div className="primary-spin-loader"></div>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label className="mb-1 tj-text-sm tj-text font-weight-500">Create app from</label>
                  <div className="tj-app-input">
                    <Select
                      options={this.generateOptionsForRepository()}
                      disabled={importingApp}
                      onChange={(newVal) => {
                        this.setState({ selectedAppRepo: newVal }, () => {
                          if (appsFromRepos[newVal]?.app_name_exist === 'EXIST') {
                            this.setState({ importingGitAppOperations: { message: 'App name already exists' } });
                          }
                        });
                      }}
                      width={'100%'}
                      value={selectedAppRepo}
                      placeholder={'Select app from git repository...'}
                      closeMenuOnSelect={true}
                      customWrap={true}
                    />
                  </div>
                </div>
                {selectedAppRepo && (
                  <div className="commit-info">
                    <div className="form-group mb-3">
                      <label className="mb-1 info-label mt-3 tj-text-xsm font-weight-500">App name</label>
                      <div className="tj-app-input">
                        <input
                          type="text"
                          disabled={true}
                          value={appsFromRepos[selectedAppRepo].git_app_name}
                          className={cx('form-control font-weight-400 disabled', {
                            'tj-input-error-state': importingGitAppOperations?.message,
                          })}
                        />
                      </div>
                      <div>
                        <div
                          className={cx(
                            { 'tj-input-error': importingGitAppOperations?.message },
                            'tj-text-xxsm info-text'
                          )}
                        >
                          {importingGitAppOperations?.message
                            ? importingGitAppOperations?.message
                            : 'App name is inherited from git repository and cannot be edited'}
                        </div>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="mb-1 tj-text-xsm font-weight-500">Last commit</label>
                      <div className="last-commit-info form-control">
                        <div className="message-info">
                          <div>{appsFromRepos[selectedAppRepo]?.last_commit_message ?? 'No commits yet'}</div>
                          <div>{appsFromRepos[selectedAppRepo]?.git_version_name}</div>
                        </div>
                        <div className="author-info">
                          {`Done by ${appsFromRepos[selectedAppRepo]?.last_commit_user} at ${moment(
                            new Date(appsFromRepos[selectedAppRepo]?.lastpush_date)
                          ).format('DD MMM YYYY, h:mm a')}`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </ModalBase>
          <Modal
            show={showAddToFolderModal && !!appOperations.selectedApp}
            closeModal={() => this.setState({ showAddToFolderModal: false, appOperations: {} })}
            title={this.props.t('homePage.appCard.addToFolder', 'Add to folder')}
          >
            <div className="row">
              <div className="col modal-main">
                <div className="mb-3 move-selected-app-to-text " data-cy="move-selected-app-to-text">
                  <p>
                    {this.props.t('homePage.appCard.move', 'Move')}
                    <span>{` "${appOperations?.selectedApp?.name}" `}</span>
                  </p>

                  <span>{this.props.t('homePage.appCard.to', 'to')}</span>
                </div>
                <div data-cy="select-folder" className="select-folder-container">
                  <Select
                    options={this.state.folders.map((folder) => {
                      return { name: folder.name, value: folder.id };
                    })}
                    disabled={!!appOperations?.isAdding}
                    onChange={(newVal) => {
                      this.setState({ appOperations: { ...appOperations, selectedFolder: newVal } });
                    }}
                    width={'100%'}
                    value={appOperations?.selectedFolder}
                    placeholder={this.props.t('homePage.appCard.selectFolder', 'Select folder')}
                    closeMenuOnSelect={true}
                  />
                </div>
              </div>
            </div>
            <div className="row">
              <div className="col d-flex modal-footer-btn">
                <ButtonSolid
                  variant="tertiary"
                  onClick={() => this.setState({ showAddToFolderModal: false, appOperations: {} })}
                  data-cy="cancel-button"
                >
                  {this.props.t('globals.cancel', 'Cancel')}
                </ButtonSolid>
                <ButtonSolid
                  onClick={this.addAppToFolder}
                  data-cy="add-to-folder-button"
                  isLoading={appOperations?.isAdding}
                >
                  {this.props.t('homePage.appCard.addToFolder', 'Add to folder')}
                </ButtonSolid>
              </div>
            </div>
          </Modal>

          <Modal
            show={showChangeIconModal && !!appOperations.selectedApp}
            closeModal={() => this.setState({ showChangeIconModal: false, appOperations: {} })}
            title={this.props.t('homePage.appCard.changeIcon', 'Change Icon')}
          >
            <div className="row">
              <div className="col modal-main icon-change-modal">
                <ul className="p-0">{this.getIcons()}</ul>
              </div>
            </div>
            <div className="row">
              <div className="col d-flex modal-footer-btn">
                <ButtonSolid
                  onClick={() => this.setState({ showChangeIconModal: false, appOperations: {} })}
                  data-cy="cancel-button"
                  variant="tertiary"
                >
                  {this.props.t('globals.cancel', 'Cancel')}
                </ButtonSolid>
                <ButtonSolid
                  className={`btn btn-primary ${appOperations?.isAdding ? 'btn-loading' : ''}`}
                  onClick={this.changeIcon}
                  data-cy="change-button"
                >
                  {this.props.t('homePage.change', 'Change')}
                </ButtonSolid>
              </div>
            </div>
          </Modal>
          {isExportingApp && app.hasOwnProperty('id') && (
            <ExportAppModal
              show={isExportingApp}
              closeModal={() => {
                this.setState({ isExportingApp: false, app: {} });
              }}
              customClassName="modal-version-lists"
              title={'Select a version to export'}
              app={app}
              darkMode={this.props.darkMode}
            />
          )}
          <div className="row gx-0">
            <div className="home-page-sidebar col p-0">
              {this.canCreateApp() && (
                <div className="create-new-app-license-wrapper">
                  <LicenseTooltip
                    limits={appsLimit}
                    feature={this.props.appType === 'workflow' ? 'workflows' : 'apps'}
                    isAvailable={true}
                    noTooltipIfValid={true}
                  >
                    <div className="create-new-app-wrapper">
                      <Dropdown as={ButtonGroup} className="d-inline-flex create-new-app-dropdown">
                        <Button
                          disabled={appsLimit?.percentage >= 100}
                          className={`create-new-app-button col-11 ${creatingApp ? 'btn-loading' : ''}`}
                          onClick={() => this.setState({ showCreateAppModal: true })}
                          data-cy="create-new-app-button"
                        >
                          {isImportingApp && (
                            <span className="spinner-border spinner-border-sm mx-2" role="status"></span>
                          )}
                          {this.props.t(
                            `${
                              this.props.appType === 'workflow' ? 'workflowsDashboard' : 'homePage'
                            }.header.createNewApplication`,
                            'Create new app'
                          )}
                        </Button>

                        {this.props.appType !== 'workflow' && (
                          <Dropdown.Toggle
                            disabled={appsLimit?.percentage >= 100}
                            split
                            className="d-inline"
                            data-cy="import-dropdown-menu"
                          />
                        )}
                        <Dropdown.Menu className="import-lg-position new-app-dropdown">
                          <Dropdown.Item
                            className="homepage-dropdown-style tj-text tj-text-xsm"
                            onClick={this.showTemplateLibraryModal}
                            data-cy="choose-from-template-button"
                          >
                            {this.props.t('homePage.header.chooseFromTemplate', 'Choose from template')}
                          </Dropdown.Item>
                          <label
                            className="homepage-dropdown-style tj-text tj-text-xsm"
                            data-cy="import-option-label"
                            onChange={this.readAndImport}
                          >
                            {this.props.t('homePage.header.import', 'Import from device')}
                            <input
                              type="file"
                              accept=".json"
                              ref={this.fileInput}
                              style={{ display: 'none' }}
                              data-cy="import-option-input"
                            />
                          </label>
                          {orgGit?.is_finalized && (
                            <LicenseTooltip
                              feature={'Import from git'}
                              limits={featureAccess}
                              noTooltipIfValid={true}
                              placement="right"
                            >
                              <Dropdown.Item
                                className="homepage-dropdown-style tj-text tj-text-xsm"
                                onClick={orgGit?.is_enabled && this.toggleGitRepositoryImportModal}
                              >
                                Import from git repository
                              </Dropdown.Item>
                            </LicenseTooltip>
                          )}
                        </Dropdown.Menu>
                      </Dropdown>
                    </div>
                  </LicenseTooltip>
                  <LicenseBanner classes="mb-3 small" limits={appsLimit} type="apps" size="small" />
                </div>
              )}
              <Folders
                foldersLoading={this.state.foldersLoading}
                folders={this.state.folders}
                currentFolder={currentFolder}
                folderChanged={this.folderChanged}
                foldersChanged={this.foldersChanged}
                canCreateFolder={this.canCreateFolder()}
                canDeleteFolder={this.canDeleteFolder()}
                canUpdateFolder={this.canUpdateFolder()}
                darkMode={this.props.darkMode}
                canCreateApp={this.canCreateApp()}
                appType={this.props.appType}
              />
              <OrganizationList />
            </div>

            <div
              className={cx('col home-page-content', {
                'bg-light-gray': !this.props.darkMode,
              })}
              data-cy="home-page-content"
            >
              <div className="w-100 mb-5 container home-page-content-container">
                {featuresLoaded && !isLoading ? (
                  <LicenseBanner
                    classes="mt-3"
                    limits={featureAccess}
                    type={featureAccess?.licenseStatus?.licenseType}
                  />
                ) : (
                  <Skeleton
                    count={1}
                    height={20}
                    width={880}
                    baseColor="#ECEEF0"
                    className="mb-3"
                    style={{ marginTop: '2rem' }}
                  />
                )}

                {(meta?.total_count > 0 || appSearchKey) && (
                  <>
                    <HomeHeader onSearchSubmit={this.onSearchSubmit} darkMode={this.props.darkMode} />
                    <div className="liner"></div>
                  </>
                )}
                {!isLoading && featuresLoaded && meta?.total_count === 0 && !currentFolder.id && !appSearchKey && (
                  <BlankPage
                    canCreateApp={this.canCreateApp}
                    isLoading={true}
                    createApp={this.createApp}
                    readAndImport={this.readAndImport}
                    isImportingApp={isImportingApp}
                    fileInput={this.fileInput}
                    openCreateAppModal={this.openCreateAppModal}
                    openCreateAppFromTemplateModal={this.openCreateAppFromTemplateModal}
                    creatingApp={creatingApp}
                    darkMode={this.props.darkMode}
                    showTemplateLibraryModal={this.state.showTemplateLibraryModal}
                    viewTemplateLibraryModal={this.showTemplateLibraryModal}
                    hideTemplateLibraryModal={this.hideTemplateLibraryModal}
                    appType={this.props.appType}
                  />
                )}
                {!isLoading && meta.total_count === 0 && appSearchKey && (
                  <div>
                    <span className={`d-block text-center text-body pt-5 ${this.props.darkMode && 'text-white-50'}`}>
                      {this.props.t('homePage.noApplicationFound', 'No Applications found')}
                    </span>
                  </div>
                )}
                {
                  <AppList
                    apps={apps}
                    canCreateApp={this.canCreateApp}
                    canDeleteApp={this.canDeleteApp}
                    canUpdateApp={this.canUpdateApp}
                    deleteApp={this.deleteApp}
                    cloneApp={this.cloneApp}
                    exportApp={this.exportApp}
                    meta={meta}
                    currentFolder={currentFolder}
                    isLoading={isLoading || !featuresLoaded}
                    darkMode={this.props.darkMode}
                    appActionModal={this.appActionModal}
                    removeAppFromFolder={this.removeAppFromFolder}
                    appType={this.props.appType}
                    basicPlan={featureAccess?.licenseStatus?.isExpired || !featureAccess?.licenseStatus?.isLicenseValid}
                  />
                }
              </div>
              {this.pageCount() > MAX_APPS_PER_PAGE && (
                <Footer
                  currentPage={meta.current_page}
                  count={this.pageCount()}
                  itemsPerPage={MAX_APPS_PER_PAGE}
                  pageChanged={this.pageChanged}
                  darkMode={this.props.darkMode}
                  dataLoading={isLoading}
                />
              )}
            </div>
            <TemplateLibraryModal
              show={this.state.showTemplateLibraryModal}
              onHide={() => this.setState({ showTemplateLibraryModal: false })}
              onCloseButtonClick={() => this.setState({ showTemplateLibraryModal: false })}
              darkMode={this.props.darkMode}
              openCreateAppFromTemplateModal={this.openCreateAppFromTemplateModal}
              appCreationDisabled={!this.canCreateApp()}
            />
          </div>
        </div>
      </Layout>
    );
  }
}

export const HomePage = withTranslation()(withRouter(HomePageComponent));
