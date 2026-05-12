"use server";

import {
  loginAction as runLoginAction,
  logoutAction as runLogoutAction,
  registerAccountAction as runRegisterAccountAction,
  registerOnboardingAction as runRegisterOnboardingAction,
  requestPasswordResetAction as runRequestPasswordResetAction,
  resendEmailOtpAction as runResendEmailOtpAction,
  updateRecoveredPasswordAction as runUpdateRecoveredPasswordAction,
  verifyEmailOtpAction as runVerifyEmailOtpAction
} from "./actions/auth";
import { requestSubscriptionPaymentAction as runRequestSubscriptionPaymentAction } from "./actions/billing";
import {
  createCategoryAction as runCreateCategoryAction,
  createMenuItemAction as runCreateMenuItemAction,
  deleteMenuItemAction as runDeleteMenuItemAction,
  importMenuOcrItemsAction as runImportMenuOcrItemsAction,
  toggleMenuItemAvailabilityAction as runToggleMenuItemAvailabilityAction,
  updateMenuItemAction as runUpdateMenuItemAction
} from "./actions/menu";
import { onboardingAction as runOnboardingAction } from "./actions/onboarding";
import {
  createPromotionAction as runCreatePromotionAction,
  deletePromotionAction as runDeletePromotionAction,
  togglePromotionAction as runTogglePromotionAction,
  togglePromotionDisplayAction as runTogglePromotionDisplayAction
} from "./actions/promotions";
import {
  createStaffAction as runCreateStaffAction,
  deleteStaffAction as runDeleteStaffAction,
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
  updateOrderingSettingsAction as runUpdateOrderingSettingsAction,
  updatePaymentSettingsAction as runUpdatePaymentSettingsAction,
  updateReportScheduleAction as runUpdateReportScheduleAction,
  updateReservationSettingsAction as runUpdateReservationSettingsAction,
  updateRestaurantSettingsAction as runUpdateRestaurantSettingsAction
} from "./actions/settings";

export async function loginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  return runLoginAction(_prevState, formData);
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

export async function requestPasswordResetAction(
  _prevState: { error?: string; success?: string } | undefined,
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

export async function updateOrderingSettingsAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  return runUpdateOrderingSettingsAction(_prevState, formData);
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

export async function deleteStaffAction(_prevState: StaffActionState | undefined, formData: FormData) {
  return runDeleteStaffAction(_prevState, formData);
}
