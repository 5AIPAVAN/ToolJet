import React, { forwardRef, useState } from 'react';
import cx from 'classnames';
import { LeftSidebarItem } from './SidebarItem';
import { commentsService, licenseService } from '@/_services';
import { useAppVersionStore } from '@/_stores/appVersionStore';
import { useEditorStore } from '@/_stores/editorStore';
import { useAppDataStore } from '@/_stores/appDataStore';
import { shallow } from 'zustand/shallow';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

export const LeftSidebarComment = forwardRef(
  ({ selectedSidebarItem, currentPageId, isVersionReleased, isEditorFreezed }, ref) => {
    const { appVersionsId } = useAppVersionStore(
      (state) => ({
        appVersionsId: state?.editingVersion?.id,
      }),
      shallow
    );

    const { appId } = useAppDataStore(
      (state) => ({
        appId: state?.appId,
      }),
      shallow
    );

    const { toggleComments } = useEditorStore(
      (state) => ({
        toggleComments: state?.actions.toggleComments,
      }),
      shallow
    );
    const [isActive, toggleActive] = React.useState(false);
    const [notifications, setNotifications] = React.useState([]);
    const shouldEnableMultiplayer = window.public_config?.ENABLE_MULTIPLAYER_EDITING === 'true';
    const [isMultiPlayerEnabled, setIsMultiPlayerEnabled] = useState(true);

    React.useEffect(() => {
      if (appVersionsId && appId) {
        commentsService.getNotifications(appId, false, appVersionsId, currentPageId).then(({ data }) => {
          setNotifications(data);
        });
      }
      async function fetchData() {
        try {
          const data = await licenseService.getFeatureAccess();
          setIsMultiPlayerEnabled(!!data?.multiPlayerEdit);
        } catch (error) {
          console.error('Error:', error);
        }
      }
      fetchData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appVersionsId, currentPageId, appId]);
    const tooltipContent = 'Comments are available only in paid plans'; // Tooltip content

    const tooltip = <Tooltip id="tooltip-disabled">{tooltipContent}</Tooltip>;
    return !shouldEnableMultiplayer && !isMultiPlayerEnabled ? (
      <OverlayTrigger placement="bottom" overlay={tooltip} trigger="hover">
        <LeftSidebarItem
          commentBadge={notifications?.length > 0}
          selectedSidebarItem={selectedSidebarItem}
          title={'toggle comments'}
          icon={'comments'}
          className={cx(`left-sidebar-item left-sidebar-layout sidebar-comments`, {
            disabled: false,
            active: isActive,
          })}
          ref={ref}
        />
      </OverlayTrigger>
    ) : (
      <LeftSidebarItem
        commentBadge={notifications?.length > 0}
        selectedSidebarItem={selectedSidebarItem}
        title={appVersionsId ? 'toggle comments' : 'Comments section will be available once you save this application'}
        icon={'comments'}
        className={cx(`left-sidebar-item left-sidebar-layout sidebar-comments`, {
          disabled:
            !appVersionsId || !shouldEnableMultiplayer || !isMultiPlayerEnabled || isVersionReleased || isEditorFreezed,
          active: isActive,
        })}
        onClick={() => {
          toggleActive(!isActive);
          toggleComments();
        }}
        tip="Comments"
        ref={ref}
      />
    );
  }
);
