export function canSendMail(usedToday: number, dailyLimit: number) {
  return dailyLimit > 0 && usedToday < dailyLimit;
}
