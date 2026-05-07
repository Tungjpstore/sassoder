export type VietQrConfig = {
  bank: string;
  account: string;
  accountName?: string;
};

export function getVietQrConfig(): VietQrConfig {
  return {
    bank: process.env.VIETQR_BANK ?? "VCB",
    account: process.env.VIETQR_ACCOUNT ?? "1234567890",
    accountName: process.env.VIETQR_ACCOUNT_NAME
  };
}

export function buildVietQrUrl({
  amount,
  orderId,
  prefix = "ORDER",
  config = getVietQrConfig()
}: {
  amount: number;
  orderId: string;
  prefix?: "ORDER" | "BILL" | "RESV";
  config?: VietQrConfig;
}) {
  const addInfo = `${prefix}-${orderId}`;
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo
  });

  return {
    url: `https://img.vietqr.io/image/${config.bank}-${config.account}-compact2.png?${params.toString()}`,
    amount,
    bank: config.bank,
    account: config.account,
    accountName: config.accountName,
    transferContent: addInfo
  };
}
