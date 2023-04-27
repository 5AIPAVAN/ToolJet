import config from 'config';
import { authHeader, handleResponse } from '@/_helpers';
import queryString from 'query-string';

export const userService = {
  getInstanceUsers,
  getAll,
  createUser,
  deleteUser,
  updateCurrentUser,
  changePassword,
  getAvatar,
  updateAvatar,
  updateUserType,
  getLicenseTerms,
};

function getInstanceUsers(page, options) {
  const requestOptions = { method: 'GET', headers: authHeader(), credentials: 'include' };
  const { firstName, lastName, email } = options;
  const query = queryString.stringify({ page, firstName, lastName, email });

  return fetch(`${config.apiUrl}/users/all?${query}`, requestOptions).then(handleResponse);
}

function getAll() {
  const requestOptions = { method: 'GET', headers: authHeader(), credentials: 'include' };
  return fetch(`${config.apiUrl}/users`, requestOptions).then(handleResponse);
}

function getAvatar(id) {
  const requestOptions = { method: 'GET', headers: authHeader(), credentials: 'include' };
  return fetch(`${config.apiUrl}/files/${id}`, requestOptions)
    .then((response) => response.blob())
    .then((blob) => blob);
}

function updateAvatar(formData) {
  const requestOptions = {
    method: 'POST',
    headers: authHeader(true),
    body: formData,
    credentials: 'include',
  };
  return fetch(`${config.apiUrl}/users/avatar`, requestOptions).then(handleResponse);
}

function createUser(first_name, last_name, email, role) {
  const body = {
    first_name,
    last_name,
    email,
    role,
  };

  const requestOptions = { method: 'POST', headers: authHeader(), credentials: 'include', body: JSON.stringify(body) };
  return fetch(`${config.apiUrl}/users`, requestOptions).then(handleResponse);
}

function deleteUser(id) {
  const requestOptions = { method: 'DELETE', headers: authHeader(), credentials: 'include', body: JSON.stringify({}) };
  return fetch(`${config.apiUrl}/users/${id}`, requestOptions).then(handleResponse);
}

function updateCurrentUser(firstName, lastName) {
  const body = { first_name: firstName, last_name: lastName };
  const requestOptions = { method: 'PATCH', headers: authHeader(), credentials: 'include', body: JSON.stringify(body) };
  return fetch(`${config.apiUrl}/users/update`, requestOptions).then(handleResponse);
}

function updateUserType(userId, userType) {
  const body = { userType, userId };
  const requestOptions = { method: 'PATCH', headers: authHeader(), body: JSON.stringify(body), credentials: 'include' };
  return fetch(`${config.apiUrl}/users/user-type`, requestOptions).then(handleResponse);
}

function changePassword(currentPassword, newPassword) {
  const body = { currentPassword, newPassword };
  const requestOptions = { method: 'PATCH', headers: authHeader(), credentials: 'include', body: JSON.stringify(body) };
  return fetch(`${config.apiUrl}/users/change_password`, requestOptions).then(handleResponse);
}

function getLicenseTerms() {
  const requestOptions = { method: 'GET', headers: authHeader(), credentials: 'include' };
  return fetch(`${config.apiUrl}/users/license-terms`, requestOptions).then(handleResponse);
}
