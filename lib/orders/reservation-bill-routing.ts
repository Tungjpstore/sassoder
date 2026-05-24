export type ReservationBillLockCandidate = {
  reservation?:
    | { status?: string | null; seated_table_bill_id?: string | null }
    | Array<{ status?: string | null; seated_table_bill_id?: string | null }>
    | null;
};

export function pickSeatedReservationBillIdFromLocks(locks: ReservationBillLockCandidate[]) {
  for (const lock of locks) {
    const reservation = Array.isArray(lock.reservation) ? lock.reservation[0] : lock.reservation;
    if (reservation?.status === "seated" && reservation.seated_table_bill_id) return reservation.seated_table_bill_id;
  }
  return null;
}
