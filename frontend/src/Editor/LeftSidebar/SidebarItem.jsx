import React from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import posthog from 'posthog-js';
import { useTranslation } from 'react-i18next';

export const LeftSidebarItem = ({
  tip = '',
  selectedSidebarItem,
  className,
  icon,
  commentBadge,
  text,
  onClick,
  badge = false,
  count,
  ...rest
}) => {
  const { t } = useTranslation();
  const displayIcon = selectedSidebarItem === icon ? `${icon}-selected` : icon;

  const Icon = require('@assets/images/icons/editor/left-sidebar/' + displayIcon + '.svg');

  const content = (
    <div
      {...rest}
      className={className}
      onClick={(e) => {
        if (onClick) {
          onClick(e);
          computePosthogEvent(text);
        }
      }}
    >
      {icon && (
        <div
          className={`sidebar-svg-icon position-relative ${displayIcon === 'settings' && 'img-invert'}`}
          data-cy={`left-sidebar-${icon.toLowerCase()}-button`}
        >
          <Icon.default />
          {commentBadge && <LeftSidebarItem.CommentBadge />}
        </div>
      )}
      {badge && <LeftSidebarItem.Badge count={count} />}
      <p>{text && t(`leftSidebar.${text}.text`, text)}</p>
    </div>
  );

  if (!tip) return content;
  return (
    <OverlayTrigger
      trigger={['click', 'hover', 'focus']}
      placement="right"
      delay={{ show: 250, hide: 200 }}
      overlay={<Tooltip id="button-tooltip">{t(`leftSidebar.${tip}.tip`, tip)}</Tooltip>}
    >
      {content}
    </OverlayTrigger>
  );
};

function computePosthogEvent(text) {
  let label = '';
  switch (text) {
    case 'Sources':
      label = 'click_menu_datasources';
      break;
    case 'Debugger':
      label = 'click_menu_debugger';
      break;
    case 'Inspector':
      label = 'click_menu_inspector';
      break;
    case 'Comments':
      label = 'click_menu_comment';
      break;
  }
  posthog.capture(label);
}

function CommentBadge() {
  return (
    <svg
      className="comment-badge"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="5" cy="5" r="5" fill="#FF6666" />
    </svg>
  );
}

function NotificationBadge({ count }) {
  const fontSize = count > 999 ? '7.5px' : '8.5px';
  return (
    <>
      {count > 0 && (
        <span className="badge bg-red rounded-circle debugger-badge p-0" style={{ fontSize: fontSize }}>
          {count > 999 ? `999+` : count}
        </span>
      )}
    </>
  );
}

LeftSidebarItem.CommentBadge = CommentBadge;
LeftSidebarItem.Badge = NotificationBadge;
