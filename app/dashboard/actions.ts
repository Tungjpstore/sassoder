"use server";

import {
  loginAction as runLoginAction,
  logoutAction as runLogoutAction,
  pinLoginAction as runPinLoginAction,
  registerAccountAction as runRegisterAccountAction,
  registerOnboardingAction as runRegisterOnboardingAction,
  requestPasswordResetAction as runRequestPasswordResetAction,
  resendEmailOtpAction as runResendEmailOtpAction,
  resendPasswordResetOtpAction as runResendPasswordResetOtpAction,
  updateRecoveredPasswordAction as runUpdateRecoveredPasswordAction,
  verifyEmailOtpAction as runVerifyEmailOtpAction
} from "./actions/auth";
import { requestSubscriptionPaymentAction as runRequestSubscriptionPaymentAction } from "./actions/billing";
import {
  updateAiAutomationRunStatusAction as runUpdateAiAutomationRunStatusAction,
  updateAiOperationInsightStatusAction as runUpdateAiOperationInsightStatusAction,
  updateAiRecommendationStatusAction as runUpdateAiRecommendationStatusAction,
  updateRestaurantAiMemoryStatusAction as runUpdateRestaurantAiMemoryStatusAction,
  runAiOperationalSweepAction as runRunAiOperationalSweepAction,
  applyAiRecommendationDraftAction as runApplyAiRecommendationDraftAction
} from "./actions/ai-insights";
import {
  retryAiMorningBriefEmailAction as runRetryAiMorningBriefEmailAction,
  updateAiMorningBriefPreferencesAction as runUpdateAiMorningBriefPreferencesAction
} from "./actions/ai-morning-brief";
import {
  applyInventoryCountAction as runApplyInventoryCountAction,
  createInventoryCategoryAction as runCreateInventoryCategoryAction,
  createInventoryIngredientAction as runCreateInventoryIngredientAction,
  createInventoryPurchaseOrderAction as runCreateInventoryPurchaseOrderAction,
  createInventorySupplierAction as runCreateInventorySupplierAction,
  createInventoryTransferAction as runCreateInventoryTransferAction,
  deactivateInventoryIngredientAction as runDeactivateInventoryIngredientAction,
  deleteInventoryRecipeLineAction as runDeleteInventoryRecipeLineAction,
  importInventoryIntakeAction as runImportInventoryIntakeAction,
  processInventoryTransferAction as runProcessInventoryTransferAction,
  receiveInventoryPurchaseOrderAction as runReceiveInventoryPurchaseOrderAction,
  recordInventoryMovementAction as runRecordInventoryMovementAction,
  refreshInventoryAlertsAction as runRefreshInventoryAlertsAction,
  updateInventoryAlertStatusAction as runUpdateInventoryAlertStatusAction,
  updateInventoryIngredientAction as runUpdateInventoryIngredientAction,
  upsertInventoryRecipeLineAction as runUpsertInventoryRecipeLineAction
} from "./actions/inventory";
import {
  createCategoryAction as runCreateCategoryAction,
  createMenuModifierGroupAction as runCreateMenuModifierGroupAction,
  createMenuModifierOptionAction as runCreateMenuModifierOptionAction,
  createMenuItemAction as runCreateMenuItemAction,
  deleteMenuModifierGroupAction as runDeleteMenuModifierGroupAction,
  deleteMenuModifierOptionAction as runDeleteMenuModifierOptionAction,
  deleteMenuItemAction as runDeleteMenuItemAction,
  importMenuOcrItemsAction as runImportMenuOcrItemsAction,
  toggleMenuModifierOptionAvailabilityAction as runToggleMenuModifierOptionAvailabilityAction,
  toggleMenuItemAvailabilityAction as runToggleMenuItemAvailabilityAction,
  updateMenuModifierGroupAction as runUpdateMenuModifierGroupAction,
  updateMenuModifierOptionAction as runUpdateMenuModifierOptionAction,
  updateMenuItemAction as runUpdateMenuItemAction
} from "./actions/menu";
import { onboardingAction as runOnboardingAction } from "./actions/onboarding";
import {
  createPromotionAction as runCreatePromotionAction,
  deletePromotionAction as runDeletePromotionAction,
  togglePromotionAction as runTogglePromotionAction,
  togglePromotionDisplayAction as runTogglePromotionDisplayAction,
  updatePromotionAction as runUpdatePromotionAction
} from "./actions/promotions";
import {
  createStaffAction as runCreateStaffAction,
  assignStaffShiftAction as runAssignStaffShiftAction,
  cloneStaffRoleAction as runCloneStaffRoleAction,
  createStaffShiftTemplateAction as runCreateStaffShiftTemplateAction,
  deleteStaffAction as runDeleteStaffAction,
  setStaffAccountStateAction as runSetStaffAccountStateAction,
  updateStaffProfileAction as runUpdateStaffProfileAction,
  updateStaffRolePermissionsAction as runUpdateStaffRolePermissionsAction,
  updateStaffRoleAction as runUpdateStaffRoleAction,
  type StaffActionState
} from "./actions/staff";
import {
  createTableAction as runCreateTableAction,
  deleteTableAction as runDeleteTableAction,
  rotateTableQrAction as runRotateTableQrAction,
  toggleTableQrAction as runToggleTableQrAction,
  updateTableAction as runUpdateTableAction
} from "./actions/tables";
import {
  applyAiSetupBrandAction as runApplyAiSetupBrandAction,
  createStoreBranchAction as runCreateStoreBranchAction,
  updateStoreBranchAction as runUpdateStoreBranchAction,
  updateBranchDeliveryAvailabilityAction as runUpdateBranchDeliveryAvailabilityAction,
  updateOrderingSettingsAction as runUpdateOrderingSettingsAction,
  updatePaymentSettingsAction as runUpdatePaymentSettingsAction,
  updateReportScheduleAction as runUpdateReportScheduleAction,
  updateReservationSettingsAction as runUpdateReservationSettingsAction,
  updateRestaurantSettingsAction as runUpdateRestaurantSettingsAction
} from "./actions/settings";

export async function loginAction(_prevState: { error?: string; redirectTo?: string } | undefined, formData: FormData) {
  return runLoginAction(_prevState, formData);
}

export async function pinLoginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  return runPinLoginAction(_prevState, formData);
}

export async function registerAccountAction(
  _prevState: { error?: string; success?: string; redirectTo?: string } | undefined,
  formData: FormData
) {
  return runRegisterAccountAction(_prevState, formData);
}

export async function registerOnboardingAction(_prevState: { error?: string } | undefined, formData: FormData) {
  return runRegisterOnboardingAction(_prevState, formData);
}

export async function verifyEmailOtpAction(_prevState: { error?: string } | undefined, formData: FormData) {
  return runVerifyEmailOtpAction(_prevState, formData);
}

export async function resendEmailOtpAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runResendEmailOtpAction(_prevState, formData);
}

export async function resendPasswordResetOtpAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runResendPasswordResetOtpAction(_prevState, formData);
}

export async function requestPasswordResetAction(
  _prevState: { error?: string; success?: string; redirectTo?: string } | undefined,
  formData: FormData
) {
  return runRequestPasswordResetAction(_prevState, formData);
}

export async function updateRecoveredPasswordAction(_prevState: { error?: string } | undefined, formData: FormData) {
  return runUpdateRecoveredPasswordAction(_prevState, formData);
}

export async function logoutAction() {
  return runLogoutAction();
}

export async function onboardingAction(_prevState: { error?: string } | undefined, formData: FormData) {
  return runOnboardingAction(_prevState, formData);
}

export async function updatePaymentSettingsAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runUpdatePaymentSettingsAction(_prevState, formData);
}

export async function updateRestaurantSettingsAction(formData: FormData) {
  return runUpdateRestaurantSettingsAction(formData);
}

export async function applyAiSetupBrandAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runApplyAiSetupBrandAction(_prevState, formData);
}

export async function updateReportScheduleAction(formData: FormData) {
  return runUpdateReportScheduleAction(formData);
}

export async function createStoreBranchAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runCreateStoreBranchAction(_prevState, formData);
}

export async function updateStoreBranchAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runUpdateStoreBranchAction(_prevState, formData);
}

export async function updateOrderingSettingsAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runUpdateOrderingSettingsAction(_prevState, formData);
}

export async function updateBranchDeliveryAvailabilityAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runUpdateBranchDeliveryAvailabilityAction(_prevState, formData);
}

export async function updateReservationSettingsAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runUpdateReservationSettingsAction(_prevState, formData);
}

export async function requestSubscriptionPaymentAction(formData: FormData) {
  return runRequestSubscriptionPaymentAction(formData);
}

export async function updateAiOperationInsightStatusAction(formData: FormData) {
  return runUpdateAiOperationInsightStatusAction(formData);
}

export async function runAiOperationalSweepAction() {
  return runRunAiOperationalSweepAction();
}

export async function applyAiRecommendationDraftAction(formData: FormData) {
  return runApplyAiRecommendationDraftAction(formData);
}

export async function updateAiRecommendationStatusAction(formData: FormData) {
  return runUpdateAiRecommendationStatusAction(formData);
}

export async function updateAiAutomationRunStatusAction(formData: FormData) {
  return runUpdateAiAutomationRunStatusAction(formData);
}

export async function updateRestaurantAiMemoryStatusAction(formData: FormData) {
  return runUpdateRestaurantAiMemoryStatusAction(formData);
}

export async function updateAiMorningBriefPreferencesAction(formData: FormData) {
  return runUpdateAiMorningBriefPreferencesAction(formData);
}

export async function retryAiMorningBriefEmailAction(formData: FormData) {
  return runRetryAiMorningBriefEmailAction(formData);
}

export async function createInventoryCategoryAction(formData: FormData) {
  return runCreateInventoryCategoryAction(formData);
}

export async function createInventorySupplierAction(formData: FormData) {
  return runCreateInventorySupplierAction(formData);
}

export async function createInventoryPurchaseOrderAction(formData: FormData) {
  return runCreateInventoryPurchaseOrderAction(formData);
}

export async function receiveInventoryPurchaseOrderAction(formData: FormData) {
  return runReceiveInventoryPurchaseOrderAction(formData);
}

export async function refreshInventoryAlertsAction(formData?: FormData) {
  return runRefreshInventoryAlertsAction(formData);
}

export async function applyInventoryCountAction(formData: FormData) {
  return runApplyInventoryCountAction(formData);
}

export async function createInventoryTransferAction(formData: FormData) {
  return runCreateInventoryTransferAction(formData);
}

export async function processInventoryTransferAction(formData: FormData) {
  return runProcessInventoryTransferAction(formData);
}

export async function updateInventoryAlertStatusAction(formData: FormData) {
  return runUpdateInventoryAlertStatusAction(formData);
}

export async function createInventoryIngredientAction(formData: FormData) {
  return runCreateInventoryIngredientAction(formData);
}

export async function updateInventoryIngredientAction(formData: FormData) {
  return runUpdateInventoryIngredientAction(formData);
}

export async function deactivateInventoryIngredientAction(formData: FormData) {
  return runDeactivateInventoryIngredientAction(formData);
}

export async function recordInventoryMovementAction(formData: FormData) {
  return runRecordInventoryMovementAction(formData);
}

export async function importInventoryIntakeAction(
  _prevState: { error?: string; success?: string; inserted?: number; updated?: number; movements?: number; skipped?: number } | undefined,
  formData: FormData
) {
  return runImportInventoryIntakeAction(_prevState, formData);
}

export async function upsertInventoryRecipeLineAction(formData: FormData) {
  return runUpsertInventoryRecipeLineAction(formData);
}

export async function deleteInventoryRecipeLineAction(formData: FormData) {
  return runDeleteInventoryRecipeLineAction(formData);
}

export async function createCategoryAction(formData: FormData) {
  return runCreateCategoryAction(formData);
}

export async function createMenuItemAction(formData: FormData) {
  return runCreateMenuItemAction(formData);
}

export async function importMenuOcrItemsAction(
  _prevState: { error?: string; success?: string; inserted?: number; skipped?: number; categoriesCreated?: number; skippedNames?: string[] } | undefined,
  formData: FormData
) {
  return runImportMenuOcrItemsAction(_prevState, formData);
}

export async function deleteMenuItemAction(formData: FormData) {
  return runDeleteMenuItemAction(formData);
}

export async function toggleMenuItemAvailabilityAction(formData: FormData) {
  return runToggleMenuItemAvailabilityAction(formData);
}

export async function updateMenuItemAction(formData: FormData) {
  return runUpdateMenuItemAction(formData);
}

export async function createMenuModifierGroupAction(formData: FormData) {
  return runCreateMenuModifierGroupAction(formData);
}

export async function updateMenuModifierGroupAction(formData: FormData) {
  return runUpdateMenuModifierGroupAction(formData);
}

export async function deleteMenuModifierGroupAction(formData: FormData) {
  return runDeleteMenuModifierGroupAction(formData);
}

export async function createMenuModifierOptionAction(formData: FormData) {
  return runCreateMenuModifierOptionAction(formData);
}

export async function updateMenuModifierOptionAction(formData: FormData) {
  return runUpdateMenuModifierOptionAction(formData);
}

export async function toggleMenuModifierOptionAvailabilityAction(formData: FormData) {
  return runToggleMenuModifierOptionAvailabilityAction(formData);
}

export async function deleteMenuModifierOptionAction(formData: FormData) {
  return runDeleteMenuModifierOptionAction(formData);
}

export async function createTableAction(formData: FormData) {
  return runCreateTableAction(formData);
}

export async function updateTableAction(formData: FormData) {
  return runUpdateTableAction(formData);
}

export async function toggleTableQrAction(formData: FormData) {
  return runToggleTableQrAction(formData);
}

export async function rotateTableQrAction(formData: FormData) {
  return runRotateTableQrAction(formData);
}

export async function deleteTableAction(formData: FormData) {
  return runDeleteTableAction(formData);
}

export async function createPromotionAction(formData: FormData) {
  return runCreatePromotionAction(formData);
}

export async function updatePromotionAction(formData: FormData) {
  return runUpdatePromotionAction(formData);
}

export async function togglePromotionAction(formData: FormData) {
  return runTogglePromotionAction(formData);
}

export async function togglePromotionDisplayAction(formData: FormData) {
  return runTogglePromotionDisplayAction(formData);
}

export async function deletePromotionAction(formData: FormData) {
  return runDeletePromotionAction(formData);
}

export async function createStaffAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runCreateStaffAction(_prevState, formData);
}

export async function updateStaffRoleAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runUpdateStaffRoleAction(_prevState, formData);
}

export async function updateStaffRolePermissionsAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runUpdateStaffRolePermissionsAction(_prevState, formData);
}

export async function cloneStaffRoleAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runCloneStaffRoleAction(_prevState, formData);
}

export async function updateStaffProfileAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runUpdateStaffProfileAction(_prevState, formData);
}

export async function setStaffAccountStateAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runSetStaffAccountStateAction(_prevState, formData);
}

export async function deleteStaffAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runDeleteStaffAction(_prevState, formData);
}

export async function createStaffShiftTemplateAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runCreateStaffShiftTemplateAction(_prevState, formData);
}

export async function assignStaffShiftAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runAssignStaffShiftAction(_prevState, formData);
}
