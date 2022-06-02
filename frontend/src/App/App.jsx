import React from 'react';
import config from 'config';
import { Router, Route, Redirect } from 'react-router-dom';
import { history } from '@/_helpers';
import { authenticationService, tooljetService } from '@/_services';
import { PrivateRoute } from '@/_components';
import { HomePage } from '@/HomePage';
import { LoginPage } from '@/LoginPage';
import { SignupPage } from '@/SignupPage';
import { ConfirmationPage, OrganizationInvitationPage } from '@/ConfirmationPage';
import { Authorize } from '@/Oauth2';
import { Authorize as Oauth } from '@/Oauth';
import { Viewer } from '@/Editor';
import { ManageGroupPermissions } from '@/ManageGroupPermissions';
import { ManageOrgUsers } from '@/ManageOrgUsers';
import { ManageGroupPermissionResources } from '@/ManageGroupPermissionResources';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { OnboardingModal } from '@/Onboarding/OnboardingModal';
import posthog from 'posthog-js';
import { ForgotPassword } from '@/ForgotPassword';
import { ResetPassword } from '@/ResetPassword';
import { ManageSSO } from '@/ManageSSO';
import { lt } from 'semver';
import { AuditLogs } from '@/AuditLogs';
import { Toaster } from 'react-hot-toast';
import { RealtimeEditor } from '@/Editor/RealtimeEditor';
import { Editor } from '@/Editor/Editor';
import { RedirectSso } from '@/RedirectSso/RedirectSso';

import '@/_styles/theme.scss';
import 'emoji-mart/css/emoji-mart.css';

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      currentUser: null,
      fetchedMetadata: false,
      onboarded: true,
      darkMode: localStorage.getItem('darkMode') === 'true',
    };
  }

  fetchMetadata = () => {
    if (this.state.currentUser) {
      tooljetService.fetchMetaData().then((data) => {
        this.setState({ onboarded: data.onboarded });

        if (data.latest_version && lt(data.installed_version, data.latest_version) && data.version_ignored === false) {
          this.setState({ updateAvailable: true });
        }
      });
    }
  };

  componentDidMount() {
    authenticationService.currentUser.subscribe((x) => {
      this.setState({ currentUser: x }, this.fetchMetadata);

      function initFreshChat() {
        window.fcWidget.init({
          token: '0ef214a3-8ae1-41fb-b0d0-57764bf8f64b',
          host: 'https://wchat.freshchat.com',
          config: {
            cssNames: {
              widget: 'custom_fc_frame',
            },
            content: {
              actions: {
                push_notify_yes: 'Yes',
              },
            },
            headerProperty: {
              hideChatButton: true,
              direction: 'rtl',
            },
          },
        });

        window.fcWidget.user.setFirstName(`${x.first_name} ${x.last_name}`);

        window.fcWidget.user.setEmail(x.email);
      }
      function initialize(i, t) {
        var e;
        i.getElementById(t)
          ? initFreshChat()
          : (((e = i.createElement('script')).id = t),
            (e.async = !0),
            (e.src = 'https://wchat.freshchat.com/js/widget.js'),
            (e.onload = initFreshChat),
            i.head.appendChild(e));
      }
      function initiateCall() {
        initialize(document, 'Freshdesk Messaging-js-sdk');
      }
      window.addEventListener
        ? window.addEventListener('load', initiateCall, !1)
        : window.attachEvent('load', initiateCall, !1);

      try {
        initiateCall();
      } catch (e) {
        console.log(e);
      }

      posthog.init('1OhSAF2367nMhuGI3cLvE6m5D0PJPBEA5zR5JFTM-yw', {
        api_host: 'https://app.posthog.com',
      });
      posthog.identify(
        x.email, // distinct_id, required
        { name: `${x.first_name} ${x.last_name}` }
      );

      this.fetchMetadata();
      setInterval(this.fetchMetadata, 1000 * 60 * 60 * 1);
    });
  }

  logout = () => {
    authenticationService.logout();
    history.push('/login');
  };

  switchDarkMode = (newMode) => {
    this.setState({ darkMode: newMode });
    localStorage.setItem('darkMode', newMode);
  };

  render() {
    const { updateAvailable, onboarded, darkMode } = this.state;
    let toastOptions = {};

    if (darkMode) {
      toastOptions = {
        style: {
          borderRadius: '10px',
          background: '#333',
          color: '#fff',
        },
      };
    }

    return (
      <>
        <Router history={history}>
          <div className={`main-wrapper ${darkMode ? 'theme-dark' : ''}`}>
            {updateAvailable && (
              <div className="alert alert-info alert-dismissible" role="alert">
                <h3 className="mb-1">Update available</h3>
                <p>A new version of ToolJet has been released.</p>
                <div className="btn-list">
                  <a
                    href="https://docs.tooljet.io/docs/setup/updating"
                    target="_blank"
                    className="btn btn-info"
                    rel="noreferrer"
                  >
                    Read release notes & update
                  </a>
                  <a
                    onClick={() => {
                      tooljetService.skipVersion();
                      this.setState({ updateAvailable: false });
                    }}
                    className="btn"
                  >
                    Skip this version
                  </a>
                </div>
              </div>
            )}

            {!onboarded && <OnboardingModal darkMode={this.state.darkMode} />}

            {window.location.host === 'apps.tooljet.com' ? (
              <PrivateRoute
                exact
                path="/:slug"
                component={Viewer}
                switchDarkMode={this.switchDarkMode}
                darkMode={darkMode}
                skipAuth={true}
              />
            ) : (
              <PrivateRoute
                exact
                path="/"
                component={HomePage}
                switchDarkMode={this.switchDarkMode}
                darkMode={darkMode}
              />
            )}

            <Route path="/login/:organisationId" exact component={LoginPage} />
            <Route path="/login" exact component={LoginPage} />
            <Route path="/sso/:origin/:configId" component={Oauth} />
            <Route path="/signup" component={SignupPage} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/multiworkspace" component={RedirectSso} />
            <Route
              path="/invitations/:token"
              render={(props) => (
                <Redirect
                  to={{
                    pathname: '/confirm',
                    state: {
                      token: props.match.params.token,
                    },
                  }}
                />
              )}
            />
            <Route
              path="/invitations/:token/workspaces/:organizationToken"
              render={(props) => (
                <Redirect
                  to={{
                    pathname: '/confirm',
                    state: {
                      token: props.match.params.token,
                      organizationToken: props.match.params.organizationToken,
                    },
                  }}
                />
              )}
            />
            <Route path="/confirm" component={ConfirmationPage} />
            <Route
              path="/organization-invitations/:token"
              render={(props) => (
                <Redirect
                  to={{
                    pathname: '/confirm-invite',
                    state: {
                      token: props.match.params.token,
                    },
                  }}
                />
              )}
            />
            <Route path="/confirm-invite" component={OrganizationInvitationPage} />
            <PrivateRoute
              exact
              path="/apps/:id"
              component={config.ENABLE_MULTIPLAYER_EDITING ? RealtimeEditor : Editor}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/applications/:id/versions/:versionId"
              component={Viewer}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/applications/:slug"
              component={Viewer}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/oauth2/authorize"
              component={Authorize}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/users"
              component={ManageOrgUsers}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/manage-sso"
              component={ManageSSO}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/groups"
              component={ManageGroupPermissions}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/groups/:id"
              component={ManageGroupPermissionResources}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/audit_logs"
              component={AuditLogs}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
            <PrivateRoute
              exact
              path="/settings"
              component={SettingsPage}
              switchDarkMode={this.switchDarkMode}
              darkMode={darkMode}
            />
          </div>
        </Router>
        <Toaster toastOptions={toastOptions} />
      </>
    );
  }
}

export { App };
