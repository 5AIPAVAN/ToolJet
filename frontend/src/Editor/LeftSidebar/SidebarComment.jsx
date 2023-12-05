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
    //not valid for cloud-licensing
    // const shouldEnableComments = window.public_config?.ENABLE_COMMENTS === 'true';
    const [basicPlan, setBasicPlan] = useState(false);
    const [shouldEnableComments, setShouldEnableComments] = useState(false);

    React.useEffect(() => {
      if (appVersionsId && appId) {
        commentsService.getNotifications(appId, false, appVersionsId, currentPageId).then(({ data }) => {
          setNotifications(data);
        });
      }
      async function fetchData() {
        try {
          const data = await licenseService.getFeatureAccess();
          setBasicPlan(data?.licenseStatus?.isExpired || !data?.licenseStatus?.isLicenseValid);
          setShouldEnableComments(data?.comments);
        } catch (error) {
          console.error('Error:', error);
        }
      }
      fetchData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appVersionsId, currentPageId, appId]);
    const tooltipContent = 'Comments are available only in paid plans'; // Tooltip content

    const tooltip = <Tooltip id="tooltip-disabled">{tooltipContent}</Tooltip>;
    return basicPlan ? (
      <OverlayTrigger placement="right" overlay={tooltip} trigger="hover">
        <div style={{ pointerEvents: 'auto' }}>
          <LeftSidebarItem
            commentBadge={false}
            selectedSidebarItem={selectedSidebarItem}
            icon={'comments'}
            iconFill={'var(--slate5)'}
            style={{ pointerEvents: 'none' }}
          />
        </div>
      </OverlayTrigger>
    ) : (
      <LeftSidebarItem
        commentBadge={notifications?.length > 0}
        selectedSidebarItem={selectedSidebarItem}
        icon={'comments'}
        className={cx(`left-sidebar-item left-sidebar-layout sidebar-comments`, {
          disabled: !appVersionsId || isVersionReleased || isEditorFreezed || !shouldEnableComments,
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
