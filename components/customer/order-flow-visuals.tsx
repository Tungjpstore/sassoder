import Image from "next/image";

export const orderFlowImageSources = {
  paymentVietqr: "/customer/order-flow/payment-vietqr.png",
  paymentConfirmation: "/customer/order-flow/payment-confirmation.png",
  restaurantConfirmation: "/customer/order-flow/restaurant-confirmation.png",
  preparing: "/customer/order-flow/preparing.png",
  deliveryHandoff: "/customer/order-flow/delivery-handoff.png",
  pickupHandoff: "/customer/order-flow/pickup-handoff.png",
  completed: "/customer/order-flow/completed.png",
  cancelled: "/customer/order-flow/cancelled.png"
} as const;

export type OrderFlowStage = {
  src: string;
  title: string;
  caption: string;
};

export function FlowImage({
  src,
  alt,
  className = "h-28",
  sizes = "240px",
  loading = "lazy",
  priority = false
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  loading?: "eager" | "lazy";
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-3xl border border-[#ebe9dd] bg-[#fbfaf5] shadow-[0_14px_34px_rgba(23,34,27,0.06)] ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} loading={priority ? undefined : loading} priority={priority} className="object-cover" />
    </div>
  );
}

export function FlowVisualCard({
  src,
  title,
  caption,
  className = "",
  imageClassName = "h-24",
  sizes = "104px"
}: {
  src: string;
  title: string;
  caption: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
}) {
  return (
    <section className={`grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 rounded-3xl border border-[#ebe9dd] bg-white p-3 shadow-[0_12px_34px_rgba(23,34,27,0.04)] ${className}`}>
      <FlowImage src={src} alt={title} className={imageClassName} sizes={sizes} />
      <div className="min-w-0">
        <h2 className="text-[15px] font-black leading-5 text-[#121813]">{title}</h2>
        <p className="mt-1 text-[12px] font-semibold leading-5 text-[#6d756d]">{caption}</p>
      </div>
    </section>
  );
}

export function OrderFlowRail({
  title,
  badge,
  stages,
  className = "",
  eagerFirst = false
}: {
  title: string;
  badge: string;
  stages: OrderFlowStage[];
  className?: string;
  eagerFirst?: boolean;
}) {
  return (
    <section className={`overflow-hidden rounded-3xl border border-[#ebe9dd] bg-[#fffdf7] p-3 shadow-[0_12px_34px_rgba(23,34,27,0.04)] ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-black text-[#121813]">{title}</h2>
        <span className="rounded-full bg-[#edf7ef] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#006b3c]">
          {badge}
        </span>
      </div>
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stages.map((stage, index) => (
          <article key={stage.title} className="w-[132px] shrink-0 overflow-hidden rounded-2xl border border-[#ecefe6] bg-white">
            <FlowImage src={stage.src} alt={stage.title} className="h-[86px] rounded-none border-0 shadow-none" sizes="132px" loading={eagerFirst && index === 0 ? "eager" : "lazy"} />
            <div className="p-2.5">
              <h3 className="truncate text-[12px] font-black text-[#121813]">{stage.title}</h3>
              <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-4 text-[#6d756d]">{stage.caption}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CustomerFlowPreview({
  mode,
  prepaid
}: {
  mode: "DELIVERY" | "PICKUP";
  prepaid: boolean;
}) {
  const handoff =
    mode === "DELIVERY"
      ? {
          src: orderFlowImageSources.deliveryHandoff,
          title: "Giao hàng",
          caption: "Theo dõi đơn đến khi nhận món."
        }
      : {
          src: orderFlowImageSources.pickupHandoff,
          title: "Đến lấy",
          caption: "Quán báo khi món đã sẵn sàng."
        };
  const stages = [
    prepaid
      ? {
          src: orderFlowImageSources.paymentVietqr,
          title: "VietQR",
          caption: "Thanh toán trước để giữ đơn nhanh."
        }
      : {
          src: orderFlowImageSources.restaurantConfirmation,
          title: "Xác nhận",
          caption: "Quán kiểm tra món và thời gian."
        },
    {
      src: orderFlowImageSources.preparing,
      title: "Chuẩn bị",
      caption: "Bếp bắt đầu làm món theo ghi chú."
    },
    handoff,
    {
      src: orderFlowImageSources.completed,
      title: "Hoàn tất",
      caption: "Đơn được ghi nhận sau khi bạn nhận món."
    }
  ];

  return (
    <OrderFlowRail
      title="Tiến độ đơn hàng"
      badge={mode === "DELIVERY" ? "Giao hàng" : "Đến lấy"}
      stages={stages}
      eagerFirst
    />
  );
}
