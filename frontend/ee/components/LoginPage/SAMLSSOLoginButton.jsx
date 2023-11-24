import config from 'config';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import Spinner from '@/_ui/Spinner';

export default function SAMLSSOLoginButton({ configId, configs, text = 'Sign in with ', setRedirectUrlToCookie }) {
  const [isLoading, setLoading] = useState(false);

  const doLogin = (e) => {
    e.preventDefault();
    setRedirectUrlToCookie();
    setLoading(true);
    fetch(`${config.apiUrl}/oauth/saml/configs/${configId}`, {
      method: 'GET',
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((json) => {
        setLoading(false);
        if (json.authorizationUrl) {
          return (window.location.href = json.authorizationUrl);
        }
        toast.error('SAML login failed');
      })
      .catch((reason) => {
        setLoading(false);
        toast.error(reason.error);
      });
  };
  return (
    <div className=" sso-btn-wrapper">
      <div onClick={doLogin} className={`border-0 sso-button rounded-2 sso-btn`} disabled={isLoading}>
        {isLoading ? (
          <div className="spinner-center">
            <Spinner className="flex" />
          </div>
        ) : (
          <>
            <img src="assets/images/sso-buttons/sso-general.svg" className="h-4" data-cy="saml-sso-icon" />
            <span className="px-1 sso-info-text" data-cy="saml-sso-text">
              {text} {configs?.name || 'SAML'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
