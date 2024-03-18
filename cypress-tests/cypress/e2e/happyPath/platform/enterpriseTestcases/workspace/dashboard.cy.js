import { verifyTooltip } from "Support/utils/common";
import { login } from "Support/utils/dashboard";
import { profileSelector } from "Selectors/profile";
import { profileText } from "Texts/profile";
import { commonSelectors } from "Selectors/common";
import { commonEeSelectors } from "Selectors/eeCommon";
import { dashboardSelector } from "Selectors/dashboard";
import { commonText } from "Texts/common";
import { dashboardText } from "Texts/dashboard";

describe(
  "dashboard",
  {
    retries: {
      runMode: 2,
    },
  },
  () => {
    it("should verify the elements on empty dashboard", () => {
      cy.intercept(
        "GET",
        "/api/apps?page=1&folder=&searchKey=&type=front-end",
        {
          fixture: "intercept/emptyDashboard.json",
        }
      ).as("emptyDashboard");
      cy.intercept("GET", "/api/folders?searchKey=&type=front-end", {
        folders: [],
      }).as("folders");
      login();
      cy.wait("@emptyDashboard");
      cy.wait("@folders");

      cy.get(commonSelectors.homePageLogo).should("be.visible");
      cy.get(commonSelectors.workspaceName).verifyVisibleElement(
        "have.text",
        "My workspace"
      );
      cy.get(commonSelectors.workspaceName).click();
      cy.get(commonSelectors.editRectangleIcon).should("be.visible");
      cy.get(commonSelectors.appCreateButton).verifyVisibleElement(
        "have.text",
        "Create new app"
      );
      cy.get(dashboardSelector.folderLabel).should("be.visible");
      cy.get(dashboardSelector.folderLabel).should(($el) => {
        expect($el.contents().first().text().trim()).to.eq("Folders");
      });
      cy.get(commonSelectors.createNewFolderButton).should("be.visible");
      cy.get(commonSelectors.allApplicationLink).verifyVisibleElement(
        "have.text",
        commonText.allApplicationLink
      );

      cy.get(commonSelectors.notificationsIcon).should("be.visible").click();
      cy.get(commonSelectors.notificationsCard).should("be.visible");
      cy.get(commonSelectors.notificationsCardTitle).verifyVisibleElement(
        "have.text",
        commonText.notificationsCardTitle
      );
      cy.get(commonSelectors.emptyNotificationIcon).should("be.visible");
      cy.get(commonSelectors.emptyNotificationTitle).verifyVisibleElement(
        "have.text",
        commonText.emptyNotificationTitle
      );
      cy.get(commonSelectors.emptyNotificationSubtitle)
        .should("be.visible")
        .and(($el) => {
          expect($el.contents().first().text().trim()).to.eq(
            commonText.emptyNotificationSubtitle
          );
        });
      cy.get(commonSelectors.notificationsCardFooter).verifyVisibleElement(
        "have.text",
        commonText.viewReadNotifications
      );

      cy.get(dashboardSelector.modeToggle).should("be.visible").click();
      cy.get(commonSelectors.mainWrapper)
        .should("have.attr", "class")
        .and("contain", "theme-dark");
      cy.get(dashboardSelector.modeToggle).click();
      cy.get(dashboardSelector.homePageContent)
        .should("have.attr", "class")
        .and("contain", "bg-light-gray");

      cy.get(commonSelectors.settingsIcon).click();
      cy.get('[data-cy="audit-log-option"]').verifyVisibleElement(
        "have.text",
        "Audit logs"
      );
      cy.get('[data-cy="instance-settings-option"]').verifyVisibleElement(
        "have.text",
        "Settings"
      );

      cy.get(commonSelectors.breadcrumbTitle).should(($el) => {
        expect($el.contents().first().text().trim()).to.eq(
          commonText.breadcrumbApplications
        );
      });
      cy.get(commonSelectors.breadcrumbPageTitle).verifyVisibleElement(
        "have.text",
        " All apps"
      );

      cy.get(dashboardSelector.versionLabel).should("be.visible");
      cy.get(dashboardSelector.emptyPageImage).should("be.visible");
      cy.get(dashboardSelector.emptyPageHeader).verifyVisibleElement(
        "have.text",
        dashboardText.emptyPageHeader
      );
      cy.get(dashboardSelector.emptyPageDescription).verifyVisibleElement(
        "have.text",
        dashboardText.emptyPageDescription
      );
      cy.get(dashboardSelector.dashboardAppCreateButton).verifyVisibleElement(
        "have.text",
        dashboardText.createAppButton
      );
      cy.get(dashboardSelector.importAppButton).should("be.visible");
      cy.get(dashboardSelector.importAppButton)
        .invoke("text")
        .then((text) => {
          expect(text.trim()).equal(dashboardText.importAppButton);
        });

      cy.get(dashboardSelector.appTemplateRow).should("be.visible");

      cy.reload();
      verifyTooltip('[data-cy="icon-dashboard"]', "Apps");
      verifyTooltip('[data-cy="icon-database"]', "ToolJet Database");
      verifyTooltip(commonSelectors.globalDataSourceIcon, "Data sources");
      verifyTooltip(commonSelectors.notificationsIcon, "Comment notifications");
      verifyTooltip(dashboardSelector.modeToggle, "Mode");
    });
  }
);
